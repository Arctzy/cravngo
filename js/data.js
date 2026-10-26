/*
 * Cravn' Go — menu and opening hours used across the website.
 *
 * If you change a price or the hours here, change them in supabase/schema.sql
 * too (then run it again in Supabase) so the website and the database agree.
 */
window.CRAVNGO_DATA = {
  menu: [
    {
      id: "carbonara",
      name: "Carbonara",
      category: "Pasta",
      price: 120,
      favorite: true,
      description: "Creamy pasta tossed with savory bacon, garlic and Parmesan — rich, comforting and flavorful in every bite.",
      image: "images/carbonara.jpg",
      width: 736,
      height: 1315,
      position: "50% 72%",
      alt: "Spaghetti carbonara topped with crispy bacon and grated Parmesan",
    },
    {
      id: "lasagna",
      name: "Lasagna",
      category: "Pasta",
      price: 150,
      description: "Layers of tender pasta, rich meat sauce and creamy béchamel, topped with melted cheese and baked golden.",
      image: "images/lasagna.jpg",
      width: 736,
      height: 736,
      alt: "A slice of layered meat lasagna with melted cheese and a basil leaf",
    },
    {
      id: "chicken-alfredo",
      name: "Chicken Alfredo",
      category: "Pasta",
      price: 300,
      description: "Tender chicken breast tossed with creamy Alfredo sauce and perfectly cooked pasta, finished with Parmesan.",
      image: "images/chicken-alfredo.jpg",
      width: 736,
      height: 1104,
      position: "50% 45%",
      alt: "Grilled chicken breast sliced over fettuccine Alfredo",
    },
    {
      id: "chicken-piccata",
      name: "Chicken Piccata",
      category: "Chicken",
      price: 250,
      favorite: true,
      description: "Pan-seared chicken breast in a tangy lemon-butter sauce with capers — bright, savory and refreshing.",
      image: "images/chicken-piccata.jpg",
      width: 600,
      height: 804,
      position: "50% 55%",
      alt: "Pan-seared chicken piccata with lemon slices and capers in butter sauce",
    },
    {
      id: "tiramisu",
      name: "Tiramisu",
      category: "Dessert",
      price: 150,
      favorite: true,
      description: "Coffee-soaked ladyfingers and smooth mascarpone cream, dusted with cocoa for an indulgent finish.",
      image: "images/tiramisu.jpg",
      width: 736,
      height: 981,
      position: "50% 55%",
      alt: "A square of tiramisu dusted with cocoa and topped with chocolate curls",
    },
    {
      id: "limonata",
      name: "Limonata",
      category: "Drinks",
      price: 95,
      description: "Italian-style lemonade made with freshly squeezed lemons, balanced with just enough sweetness.",
      image: "images/limonata.jpg",
      width: 736,
      height: 736,
      alt: "A glass of iced limonata garnished with a lemon slice and mint",
    },
  ],

  // days: 0 = Sunday … 6 = Saturday · 24-hour time · Philippine time
  hours: [
    { label: "Mon – Thu", days: [1, 2, 3, 4], open: "11:00", close: "21:00" },
    { label: "Fri – Sat", days: [5, 6], open: "11:00", close: "23:00" },
    { label: "Sunday", days: [0], open: "15:00", close: "23:00" },
  ],
};
