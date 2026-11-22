export const CAT_NAMES = ["Mochi", "Pixel", "Miso", "Tofu", "Boba", "Nori", "Pudding", "Yuzu", "Biscuit", "Comet", "Pebble", "Sesame", "Waffle", "Noodle", "Luna", "Bean", "Kiwi", "Maple", "Orbit", "Pip"];
export const randomCat = () => ({
  name: CAT_NAMES[Math.floor(Math.random() * CAT_NAMES.length)],
  hue: Math.floor(Math.random() * 360),
});
