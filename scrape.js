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
const failedLinks = new Set();

const GENRES = {
    28: "Aksiyon", 12: "Macera", 16: "Animasyon", 35: "Komedi",
    80: "Suç", 99: "Belgesel", 18: "Dram", 10751: "Aile",
    14: "Fantastik", 36: "Tarih", 27: "Korku", 10402: "Müzik",
    9648: "Gizem", 10749: "Romantik", 878: "Bilim Kurgu",
    53: "Gerilim", 10752: "Savaş", 37: "Western"
};

const GENRE_ICONS = {
    "Aksiyon": "💥", "Komedi": "😂", "Dram": "🎭", "Korku": "👻",
    "Bilim Kurgu": "🚀", "Romantik": "💕", "Macera": "🗺️", "Suç": "🔫",
    "Gerilim": "🔪", "Animasyon": "🐭", "Aile": "👨‍👩‍👧", "Fantastik": "🧙",
    "Tarih": "📜", "Savaş": "⚔️", "Gizem": "🔍", "Müzik": "🎵",
    "Western": "🤠", "Belgesel": "🎥"
};

async function getMovieGenres(tmdbId) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${API_KEY}&language=tr`;
        const response = await axios.get(url);
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
        const response = await axios.get(url);
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

// Sadece VS linki ile kontrol et
function createVsLink(imdbId) {
    return `https://vidmody.com/vs/${imdbId}`;
}

async function checkLink(url) {
    if (failedLinks.has(url)) return false;
    try {
        await axios.head(url, { 
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return true;
    } catch {
        failedLinks.add(url);
        return false;
    }
}

async function fetchFromVidmody() {
    console.log("\n🎬 VİDMODY Filmleri taranıyor...");
    const movies = [];

    // En eski filmden başlayarak tüm filmleri çek
    console.log("\n📅 Tüm filmler taranıyor (1900'den günümüze)...");
    
    // 1900'den 2026'ya kadar tüm yılları tara
    for (let year = 2026; year >= 1900; year--) {
        console.log(`📅 ${year} taranıyor...`);
        let yearCount = 0;
        
        // Her yıl için 20 sayfa tara (daha fazla film bulmak için)
        for (let page = 1; page <= 20; page++) {
            const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=tr&sort_by=popularity.desc&primary_release_year=${year}&page=${page}`;
            try {
                const response = await axios.get(url);
                if (response.data.results.length === 0) break;
                
                for (const movie of response.data.results) {
                    const imdbId = await getImdbId(movie.id);
                    if (imdbId) {
                        // VS ile kontrol et
                        const vsLink = createVsLink(imdbId);
                        if (await checkLink(vsLink)) {
                            // Film varsa direkt VS linkini ekle
                            const genreInfo = await getMovieGenres(movie.id);
                            movies.push({
                                title: movie.title,
                                year: year,
                                link: vsLink, // VS linki direkt
                                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                                rating: movie.vote_average || 0,
                                mainGenre: genreInfo.mainGenre,
                                allGenres: genreInfo.genres,
                                source: 'vidmody'
                            });
                            yearCount++;
                            console.log(`   ✓ ${movie.title} (${year} - ${genreInfo.mainGenre}) ⭐ ${movie.vote_average || "?"}`);
                        }
                    }
                    await new Promise(r => setTimeout(r, 25));
                }
            } catch(e) { 
                // Hata durumunda sonraki sayfaya geç
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
    m3u += `# Kaynak: Vidmody\n`;
    m3u += `# ⭐ IMDb puanına göre sıralanmıştır\n\n`;

    // Yıla göre sırala (en yeniden en eskiye)
    const sortedMovies = [...uniqueMovies].sort((a, b) => {
        if (a.year === "Bilinmiyor") return 1;
        if (b.year === "Bilinmiyor") return -1;
        return b.year - a.year;
    });

    // Grupları oluştur
    const moviesByGenre = {};
    for (const movie of sortedMovies) {
        const genre = movie.mainGenre;
        if (!moviesByGenre[genre]) moviesByGenre[genre] = [];
        moviesByGenre[genre].push(movie);
    }

    // Türlere göre sırala (en çok film olan türden başla)
    const sortedGenres = Object.keys(moviesByGenre).sort((a, b) => moviesByGenre[b].length - moviesByGenre[a].length);
    
    for (const genre of sortedGenres) {
        const genreMovies = moviesByGenre[genre];
        // Her tür içinde yıla göre sırala (en yeniden en eskiye)
        genreMovies.sort((a, b) => {
            if (a.year === "Bilinmiyor") return 1;
            if (b.year === "Bilinmiyor") return -1;
            return b.year - a.year;
        });
        
        const icon = GENRE_ICONS[genre] || "🎬";
        m3u += `# ${icon} ${genre.toUpperCase()} (${genreMovies.length} adet)\n`;
        for (const m of genreMovies) {
            const yearInfo = m.year !== "Bilinmiyor" ? ` (${m.year})` : "";
            m3u += `#EXTINF:-1 group-title="${genre}" tvg-logo="${m.poster}", ${m.title}${yearInfo} ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }

    fs.writeFileSync('filmler/films.m3u', m3u);
    return uniqueMovies.length;
}

async function scrape() {
    console.log("🎬 FİLM ARŞİVİ TARANIYOR (VİDMODY)...\n");
    const movies = await fetchFromVidmody();
    const total = createM3U(movies);
    console.log(`\n✅ TAMAMLANDI!`);
    console.log(`📊 Toplam film: ${total}`);
    console.log(`💾 Kaydedildi: filmler/films.m3u`);
}

scrape().catch(console.error);
