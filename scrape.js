const axios = require('axios');
const fs = require('fs');

const API_KEY = '5a98ac2ab1eeba8124c3f6a10f4f13ab';

if (!API_KEY) {
    console.error("❌ TMDB API anahtarı bulunamadı!");
    process.exit(1);
}

if (!fs.existsSync('filmler')) {
    fs.mkdirSync('filmler');
}

const processedMovies = new Set();

const GENRE_ICONS = {
    "Aksiyon": "💥", "Komedi": "😂", "Dram": "🎭", "Korku": "👻",
    "Bilim Kurgu": "🚀", "Romantik": "💕", "Macera": "🗺️", "Suç": "🔫",
    "Gerilim": "🔪", "Animasyon": "🐭", "Aile": "👨‍👩‍👧", "Fantastik": "🧙",
    "Tarih": "📜", "Savaş": "⚔️", "Gizem": "🔍", "Müzik": "🎵",
    "Western": "🤠", "Belgesel": "🎥", "Diğer": "🎬"
};

async function getMovieGenres(tmdbId) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${API_KEY}&language=tr`;
        const response = await axios.get(url, { timeout: 8000 });
        const genreNames = response.data.genres.map(g => g.name);
        const mainGenre = genreNames[0] || "Diğer";
        return { genres: genreNames, mainGenre };
    } catch {
        return { genres: ["Diğer"], mainGenre: "Diğer" };
    }
}

async function getImdbId(tmdbId) {
    if (processedMovies.has(tmdbId)) return null;
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${API_KEY}`;
        const response = await axios.get(url, { timeout: 8000 });
        const imdbId = response.data.imdb_id;
        if (imdbId) {
            processedMovies.add(tmdbId);
            return imdbId;
        }
        return null;
    } catch {
        return null;
    }
}

// IMDb ID varsa linki oluştur, kontrol YOK
function createVsLink(imdbId) {
    return `http://ha.vixolity.com/vs/${imdbId}/`;
}

async function fetchFromVidmody() {
    console.log("\n🎬 VIXOLITY Filmleri taranıyor (link kontrolü YOK)...");
    const movies = [];

    for (let year = 2026; year >= 2010; year--) {
        console.log(`📅 ${year} taranıyor...`);
        let yearCount = 0;

        for (let page = 1; page <= 20; page++) {
            const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=tr&sort_by=popularity.desc&primary_release_year=${year}&page=${page}`;
            try {
                const response = await axios.get(url, { timeout: 8000 });
                if (response.data.results.length === 0) break;

                for (const movie of response.data.results) {
                    const imdbId = await getImdbId(movie.id);
                    if (!imdbId) continue;

                    // Link kontrolü kaldırıldı — IMDb ID varsa direkt ekle
                    const genreInfo = await getMovieGenres(movie.id);
                    movies.push({
                        title: movie.title,
                        year: year,
                        link: createVsLink(imdbId),
                        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                        rating: movie.vote_average || 0,
                        mainGenre: genreInfo.mainGenre,
                        allGenres: genreInfo.genres,
                        source: 'vixolity'
                    });
                    yearCount++;
                    console.log(`   ✓ ${movie.title} (${year} - ${genreInfo.mainGenre}) ⭐ ${movie.vote_average || "?"}`);
                    await new Promise(r => setTimeout(r, 30));
                }
            } catch(e) {
                continue;
            }
        }
        console.log(`   ${year} için ${yearCount} film eklendi`);
    }

    return movies;
}

function createM3U(movies) {
    const uniqueMovies = [];
    const seenTitles = new Set();
    for (const movie of movies) {
        const cleanTitle = movie.title.toLowerCase().trim();
        if (!seenTitles.has(cleanTitle)) {
            seenTitles.add(cleanTitle);
            uniqueMovies.push(movie);
        }
    }

    console.log(`\n📊 Tekrar eden filmler temizlendi: ${movies.length} -> ${uniqueMovies.length}`);

    let m3u = '#EXTM3U\n';
    m3u += `# Film Arşivi - ${new Date().toLocaleDateString('tr-TR')}\n`;
    m3u += `# Toplam: ${uniqueMovies.length} film\n`;
    m3u += `# Kaynak: Vixolity\n\n`;

    const sortedMovies = [...uniqueMovies].sort((a, b) => b.year - a.year);

    const moviesByGenre = {};
    for (const movie of sortedMovies) {
        const genre = movie.mainGenre;
        if (!moviesByGenre[genre]) moviesByGenre[genre] = [];
        moviesByGenre[genre].push(movie);
    }

    const sortedGenres = Object.keys(moviesByGenre).sort((a, b) => moviesByGenre[b].length - moviesByGenre[a].length);

    for (const genre of sortedGenres) {
        const genreMovies = moviesByGenre[genre].sort((a, b) => b.year - a.year);
        const icon = GENRE_ICONS[genre] || "🎬";
        m3u += `# ${icon} ${genre.toUpperCase()} (${genreMovies.length} adet)\n`;
        for (const m of genreMovies) {
            m3u += `#EXTINF:-1 group-title="${genre}" tvg-logo="${m.poster}", ${m.title} (${m.year}) ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }

    fs.writeFileSync('filmler/films.m3u', m3u);
    return uniqueMovies.length;
}

async function scrape() {
    console.log("🎬 FİLM ARŞİVİ TARANIYOR (VIXOLITY)...\n");
    const movies = await fetchFromVidmody();
    const total = createM3U(movies);
    console.log(`\n✅ TAMAMLANDI!`);
    console.log(`📊 Toplam film: ${total}`);
    console.log(`💾 Kaydedildi: filmler/films.m3u`);
}

scrape().catch(console.error);
