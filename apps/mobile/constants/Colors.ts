const primary = '#FFC107';
const primaryDark = '#FFA000';
const dark = '#1A1A1A';
const background = '#F5F5F5';
const textSecondary = '#666666';

export default {
  light: {
    text: dark,
    background,
    tint: primary,
    tabIconDefault: '#ccc',
    tabIconSelected: primaryDark,
    primary,
    dark,
    textSecondary,
    card: '#FFFFFF',
  },
  dark: {
    text: '#FFFFFF',
    background: dark,
    tint: primary,
    tabIconDefault: '#888',
    tabIconSelected: primary,
    primary,
    dark: '#000000',
    textSecondary: '#AAAAAA',
    card: '#2A2A2A',
  },
};
