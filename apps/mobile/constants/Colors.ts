const black = '#000000';
const white = '#FFFFFF';
const gray100 = '#F3F3F3';
const gray200 = '#E8E8E8';
const gray400 = '#6B6B6B';
const accent = '#276EF1';

const light = {
  text: black,
  background: white,
  tint: black,
  tabIconDefault: gray400,
  tabIconSelected: black,
  primary: black,
  onPrimary: white,
  dark: black,
  textSecondary: gray400,
  card: gray100,
  surface: white,
  border: gray200,
  accent,
  tabBarBg: white,
  tabActiveBg: gray100,
  buttonBg: black,
  buttonText: white,
  promoBg: '#FFF9E6',
  promoAccent: '#FFF3C4',
  mapPlaceholder: gray100,
  shadow: '#000000',
  selectedBorder: black,
  selectedBg: '#FAFAFA',
};

const dark = {
  text: white,
  background: '#121212',
  tint: white,
  tabIconDefault: gray400,
  tabIconSelected: white,
  primary: white,
  onPrimary: black,
  dark: black,
  textSecondary: gray400,
  card: '#1E1E1E',
  surface: '#1E1E1E',
  border: '#333333',
  accent,
  tabBarBg: '#1E1E1E',
  tabActiveBg: '#2A2A2A',
  buttonBg: white,
  buttonText: black,
  promoBg: '#2A2418',
  promoAccent: '#3D3520',
  mapPlaceholder: '#1A1A1A',
  shadow: '#000000',
  selectedBorder: white,
  selectedBg: '#2A2A2A',
};

export default { light, dark };

export type AppColors = typeof light;
