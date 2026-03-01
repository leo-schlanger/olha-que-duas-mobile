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
    isLive: true,
    tagline: "A sua voz, 24 horas por dia",
    quality: "192kbps",
  },
  supabase: {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
  },
};

// App color palette
export const colors = {
  primary: "#b4292b",
  secondary: "#FFD700",
  background: "#1a1a1a",
  backgroundLight: "#FFFDF5",
  card: "#2a2a2a",
  text: "#ffffff",
  textSecondary: "#a0a0a0",
  success: "#22c55e",
  error: "#ef4444",
  charcoal: "#2d2d2d",
  beige: "#F5F0E6",
  white: "#FFFFFF",
  black: "#000000",
};
