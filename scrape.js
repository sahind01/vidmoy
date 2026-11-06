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

// ✅ DÜZELTME 1: Ortak axios yapılandırması, tarayıcı kimliğine yakın
const axiosInstance = axios.create({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Referer': 'http://ha.vixolity.com/'
    }
});

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

// ✅ DÜZELTME 2: Trailing slash'i koru, site gerçekten bu formatı kullanıyor
function createVsLink(imdbId) {
    return `http://ha.vixolity.com/vs/${imdbId}/`;
}

// ✅ DÜZELTME 3: HEAD yerine GET kullan, ancak stream:true ile sadece header kontrolü yap
// ✅ DÜZELTME 4: 403/503 Cloudflare durumunu ayrı işle, tüm filmleri başarısız sayma
async function checkLink(url) {
    if (failedLinks.has(url)) return false;
    try {
        const response = await axiosInstance.get(url, {
            timeout: 8000,
            maxRedirects: 5,
            validateStatus: function (status) {
                // 2xx ve 3xx başarılı sayılır
                // 403/503 Cloudflare challenge olabilir, şimdilik "belirsiz" olarak işaretleyip atla
                return status >= 200 && status < 400;
            },
            // Sadece yanıt başlığını al, tüm içeriği indirme
            responseType: 'stream'
        });

        // Yanıt gövdesini hemen kapat, kaynak israfını önle
        if (response.data && typeof response.data.destroy === 'function') {
            response.data.destroy();
        }

        return true;
    } catch (err) {
        // 403 / 503 genellikle Cloudflare korumasıdır, bu filmi "başarısız" olarak işaretleme
        // sadece bu turda atla, tüm listede 0 sonucu oluşmasını önle
        const status = err.response?.status;
        if (status === 403 || status === 503) {
            console.log(`   ⚠️ Cloudflare koruması tespit edildi, atlanıyor: ${url}`);
            // failedLinks'e ekleme, böylece sonraki turlarda tekrar denenebilir
            return false;
        }
        failedLinks.add(url);
        return false;
    }
}

async function fetchFromVidmody() {
    console.log("\n🎬 VIXOLITY Filmleri taranıyor...");
    const movies = [];

    console.log("\n📅 Tüm filmler taranıyor (2026'dan 2010'a)...");

    for (let year = 2026; year >= 2010; year--) {
        console.log(`📅 ${year} taranıyor...`);
        let yearCount = 0;
        let yearChecked = 0;

        for (let page = 1; page <= 20; page++) {
            const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=tr&sort_by=popularity.desc&primary_release_year=${year}&page=${page}`;
            try {
                const response = await axios.get(url);
                if (response.data.results.length === 0) break;

                for (const movie of response.data.results) {
                    yearChecked++;
                    const imdbId = await getImdbId(movie.id);
                    if (imdbId) {
                        const vsLink = createVsLink(imdbId);
                        if (await checkLink(vsLink)) {
                            const genreInfo = await getMovieGenres(movie.id);
                            movies.push({
                                title: movie.title,
                                year: year,
                                link: vsLink,
                                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                                rating: movie.vote_average || 0,
                                mainGenre: genreInfo.mainGenre,
                                allGenres: genreInfo.genres,
                                source: 'vixolity'
                            });
                            yearCount++;
                            console.log(`   ✓ ${movie.title} (${year} - ${genreInfo.mainGenre}) ⭐ ${movie.vote_average || "?"}`);
                        }
                    }
                    await new Promise(r => setTimeout(r, 100)); // Biraz daha uzun bekleme, engellenmemek için
                }
            } catch(e) {
                console.log(`   ⚠️ ${year} sayfa ${page} isteği başarısız: ${e.message}`);
                continue;
            }
        }
        console.log(`   ${year} için ${yearCount} film eklendi (${yearChecked} kontrol edildi)`);
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
    m3u += `# Kaynak: Vixolity\n`;
    m3u += `# ⭐ IMDb puanına göre sıralanmıştır\n\n`;

    const sortedMovies = [...uniqueMovies].sort((a, b) => {
        if (a.year === "Bilinmiyor") return 1;
        if (b.year === "Bilinmiyor") return -1;
        return b.year - a.year;
    });

    const moviesByGenre = {};
    for (const movie of sortedMovies) {
        const genre = movie.mainGenre;
        if (!moviesByGenre[genre]) moviesByGenre[genre] = [];
        moviesByGenre[genre].push(movie);
    }

    const sortedGenres = Object.keys(moviesByGenre).sort((a, b) => moviesByGenre[b].length - moviesByGenre[a].length);

    for (const genre of sortedGenres) {
        const genreMovies = moviesByGenre[genre];
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
    console.log("🎬 FİLM ARŞİVİ TARANIYOR (VIXOLITY)...\n");
    const movies = await fetchFromVidmody();
    const total = createM3U(movies);
    console.log(`\n✅ TAMAMLANDI!`);
    console.log(`📊 Toplam film: ${total}`);
    console.log(`💾 Kaydedildi: filmler/films.m3u`);
}

scrape().catch(console.error);
