// Site configuration for the mobile app
// Contains all constants used across the application

export const siteConfig = {
  contact: {
    email: "olhaqueduas.assessoria@gmail.com",
  },
  social: {
    instagram: "https://www.instagram.com/olhaqueduas2025",
    facebook: "https://www.facebook.com/share/17npXT7nNb/",
    tiktok: "https://www.tiktok.com/@olha.que.duas_",
    youtube: "https://youtube.com/@olhaqueduas-l9m",
    spotify: "https://open.spotify.com",
  },
  radio: {
    name: "Rádio Olha que Duas",
    streamUrl: "https://radio.olhaqueduas.com/listen/olha_que_duas/radio.mp3",
    artworkUrl: "https://radio.olhaqueduas.com/static/img/generic_song.jpg",
    isLive: true,
    tagline: "A sua voz, 24 horas por dia",
    quality: "192kbps",
    schedule: [
      { day: "Segunda", show: "Nutrição", times: ["12:00", "19:00"], icon: "leaf-outline" },
      { day: "Terça", show: "Motivar", times: ["12:00", "19:00"], icon: "bulb-outline" },
      { day: "Quarta", show: "Prazer Feminino", times: ["21:00", "00:00"], icon: "heart-outline" },
      { day: "Quinta", show: "Companheiros de Caminhada", times: ["12:00", "19:00"], icon: "walk-outline" },
      { day: "Sexta", show: "Dizem que...", times: ["12:00", "19:00"], icon: "chatbubbles-outline" },
      { day: "Sábado", show: "Olha que Duas!", times: ["11:00", "19:00", "00:00"], icon: "people-outline" },
    ],
  },
  supabase: {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || (() => {
      if (__DEV__) console.warn('EXPO_PUBLIC_SUPABASE_URL is not set!');
      return '';
    })(),
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || (() => {
      if (__DEV__) console.warn('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set!');
      return '';
    })(),
  },
};

// App color palette - Updated to match website (Light Theme)
export const colors = {
  primary: "#d6402e", // Vermelho
  secondary: "#f0c042", // Amarelo/Gold
  background: "#f7f4ed", // Beige Light
  backgroundCard: "#faf8f2", // Cream
  card: "#faf8f2", // Cream
  text: "#6e5a4a", // Charcoal / Foreground
  textSecondary: "#8b7e74", // Softer Charcoal
  success: "#22c55e",
  error: "#ef4444",
  charcoal: "#6e5a4a",
  amarelo: "#f0c042",
  amareloSoft: "#f7d98d",
  vermelho: "#d6402e",
  vermelhoSoft: "#e47163",
  beige: "#f7f4ed",
  beigeDark: "#6e5a4a",
  white: "#FFFFFF",
  black: "#000000",
  muted: "#e0d1bc",
};

