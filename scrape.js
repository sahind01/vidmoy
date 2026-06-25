const axios = require('axios');
const fs = require('fs');
const puppeteer = require('puppeteer');

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

// PUPPETEER ile gerçek .m3u8 linkini bul
async function getRealVideoLink(imdbId) {
    const vsUrl = `https://vidmody.com/vs/${imdbId}`;
    let browser = null;
    
    try {
        console.log(`   🔍 ${imdbId} için link aranıyor...`);
        
        // Puppeteer başlat
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        
        // User-Agent ayarla
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Sayfayı aç ve bekle
        await page.goto(vsUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        // Sayfadaki tüm .m3u8 linklerini ara
        const videoLink = await page.evaluate(() => {
            // 1. Script içindeki linkler
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const content = script.textContent;
                if (content) {
                    // .m3u8 ile biten linkleri bul
                    const match = content.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
                    if (match) return match[0];
                }
            }
            
            // 2. iframe içindeki linkler
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                const src = iframe.src;
                if (src && src.includes('.m3u8')) return src;
            }
            
            // 3. video etiketleri
            const videos = document.querySelectorAll('video source, video');
            for (const video of videos) {
                const src = video.src || video.getAttribute('src');
                if (src && src.includes('.m3u8')) return src;
            }
            
            // 4. a etiketleri
            const links = document.querySelectorAll('a');
            for (const link of links) {
                const href = link.href;
                if (href && href.includes('.m3u8')) return href;
            }
            
            return null;
        });
        
        if (videoLink) {
            console.log(`   ✅ Link bulundu: ${videoLink.substring(0, 60)}...`);
            return videoLink;
        }
        
        console.log(`   ⚠️ Sayfada link bulunamadı, varsayılan formatlar deneniyor...`);
        
        // Varsayılan formatları dene (çalışanı bul)
        const cleanImdb = imdbId.replace('tt', '');
        const possibleFormats = [
            `https://vidmody.com/mm/tt${cleanImdb}/main/index-v1-a1.m3u8`,
            `https://vidmody.com/mm/tt${cleanImdb}/rumain1080/index-v1-a1.m3u8`,
            `https://vidmody.com/mm/tt${cleanImdb}/ccmain1080/index-v1-a1.m3u8`,
            `https://vidmody.com/mm/tt${cleanImdb}/main_1080p/index-v1-a1.m3u8`,
            `https://vidmody.com/mm/tt${cleanImdb}/index-v1-a1.m3u8`,
            `https://vidmody.com/mm/tt${cleanImdb}/playlist.m3u8`,
            `https://vidmody.com/mm/tt${cleanImdb}/video.m3u8`
        ];
        
        for (const format of possibleFormats) {
            try {
                await axios.head(format, { 
                    timeout: 3000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                console.log(`   ✅ Varsayılan format çalışıyor: ${format}`);
                return format;
            } catch (e) {
                continue;
            }
        }
        
        console.log(`   ❌ ${imdbId} için link bulunamadı!`);
        return null;
        
    } catch (error) {
        console.log(`   ❌ ${imdbId} için hata: ${error.message}`);
        return null;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function fetchFromVidmody() {
    console.log("\n🎬 VİDMODY Filmleri taranıyor...");
    const movies = [];

    console.log("🆕 Vizyondaki filmler taranıyor...");
    let vizyonPage = 1;
    while (vizyonPage <= 5) {
        try {
            const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${API_KEY}&language=tr&page=${vizyonPage}`;
            const response = await axios.get(url);
            if (response.data.results.length === 0) break;
            for (const movie of response.data.results) {
                const imdbId = await getImdbId(movie.id);
                if (imdbId) {
                    const realLink = await getRealVideoLink(imdbId);
                    if (realLink) {
                        const genreInfo = await getMovieGenres(movie.id);
                        movies.push({
                            title: movie.title,
                            year: "Vizyonda",
                            link: realLink,
                            poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                            rating: movie.vote_average || 0,
                            mainGenre: genreInfo.mainGenre,
                            allGenres: genreInfo.genres,
                            source: 'vidmody'
                        });
                        console.log(`   ✓ ${movie.title} (${genreInfo.mainGenre}) ⭐ ${movie.vote_average}`);
                    }
                }
                await new Promise(r => setTimeout(r, 100));
            }
            vizyonPage++;
        } catch(e) { break; }
    }

    console.log("\n📅 Filmler taranıyor...");
    for (let year = 2026; year >= 1980; year--) {
        console.log(`📅 ${year} taranıyor...`);
        let yearCount = 0;
        for (let page = 1; page <= 10; page++) {
            const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=tr&sort_by=popularity.desc&primary_release_year=${year}&page=${page}`;
            try {
                const response = await axios.get(url);
                if (response.data.results.length === 0) break;
                for (const movie of response.data.results) {
                    const imdbId = await getImdbId(movie.id);
                    if (imdbId) {
                        const realLink = await getRealVideoLink(imdbId);
                        if (realLink) {
                            const genreInfo = await getMovieGenres(movie.id);
                            movies.push({
                                title: movie.title,
                                year,
                                link: realLink,
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
                    await new Promise(r => setTimeout(r, 100));
                }
            } catch(e) { break; }
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

    const vizyon = uniqueMovies.filter(m => m.year === "Vizyonda");
    if (vizyon.length > 0) {
        vizyon.sort((a, b) => b.rating - a.rating);
        m3u += `# 🆕 VİZYONDAKİLER (${vizyon.length} adet)\n`;
        for (const m of vizyon) {
            m3u += `#EXTINF:-1 group-title="Vizyondakiler" tvg-logo="${m.poster}", ${m.title} ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }

    const moviesByGenre = {};
    for (const movie of uniqueMovies.filter(m => m.year !== "Vizyonda")) {
        const genre = movie.mainGenre;
        if (!moviesByGenre[genre]) moviesByGenre[genre] = [];
        moviesByGenre[genre].push(movie);
    }

    const sortedGenres = Object.keys(moviesByGenre).sort((a, b) => moviesByGenre[b].length - moviesByGenre[a].length);
    for (const genre of sortedGenres) {
        const genreMovies = moviesByGenre[genre];
        genreMovies.sort((a, b) => b.rating - a.rating);
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
    console.log("⏳ Bu işlem biraz zaman alabilir (Puppeteer kullanılıyor)...\n");
    const movies = await fetchFromVidmody();
    const total = createM3U(movies);
    console.log(`\n✅ TAMAMLANDI!`);
    console.log(`📊 Toplam film: ${total}`);
    console.log(`💾 Kaydedildi: filmler/films.m3u`);
}

scrape().catch(console.error);
