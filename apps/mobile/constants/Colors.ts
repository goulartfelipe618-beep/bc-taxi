const black = '#000000';
const white = '#FFFFFF';
const gray100 = '#F3F3F3';
const gray200 = '#E8E8E8';
const gray400 = '#6B6B6B';
const gray600 = '#545454';
const accent = '#276EF1';

export default {
  light: {
    text: black,
    background: white,
    tint: black,
    tabIconDefault: gray400,
    tabIconSelected: black,
    primary: black,
    dark: black,
    textSecondary: gray400,
    card: gray100,
    surface: white,
    border: gray200,
    accent,
    tabBarBg: white,
    tabActiveBg: gray100,
  },
  dark: {
    text: white,
    background: '#121212',
    tint: white,
    tabIconDefault: gray400,
    tabIconSelected: white,
    primary: white,
    dark: black,
    textSecondary: gray400,
    card: '#1E1E1E',
    surface: '#1E1E1E',
    border: '#333333',
    accent,
    tabBarBg: '#1E1E1E',
    tabActiveBg: '#2A2A2A',
  },
};
