export const COLORS = [
  "#4F8EF7","#34C97B","#F7B731","#E05C5C",
  "#9B59B6","#1ABC9C","#E67E22","#2ECC71",
  "#3498DB","#E91E63"
];

export const DEFAULT_CATS = {
  income:  ["Sales","Freelance","Investment","Rental","Other Income"],
  expense: ["Rent","Salaries","Marketing","Utilities","Travel","Software","Other Expense"]
};

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const HINT_QS = [
  "What is your mother's maiden name?",
  "What was your first pet's name?",
  "What city were you born in?",
  "What is your favorite movie?",
  "What was the name of your first school?"
];

export const CURRENCIES = [
  { symbol: "$",   name: "USD - US Dollar" },
  { symbol: "€",   name: "EUR - Euro" },
  { symbol: "£",   name: "GBP - British Pound" },
  { symbol: "¥",   name: "JPY - Japanese Yen" },
  { symbol: "₹",   name: "INR - Indian Rupee" },
  { symbol: "₨",   name: "PKR - Pakistani Rupee" },
  { symbol: "﷼",   name: "SAR - Saudi Riyal" },
  { symbol: "د.إ", name: "AED - UAE Dirham" },
  { symbol: "₺",   name: "TRY - Turkish Lira" },
  { symbol: "₩",   name: "KRW - South Korean Won" },
  { symbol: "R",   name: "ZAR - South African Rand" },
  { symbol: "CHF", name: "CHF - Swiss Franc" },
  { symbol: "C$",  name: "CAD - Canadian Dollar" },
  { symbol: "A$",  name: "AUD - Australian Dollar" },
  { symbol: "฿",   name: "THB - Thai Baht" },
];

export const DATE_FORMATS = ["YYYY-MM-DD","DD/MM/YYYY","MM/DD/YYYY","DD-MM-YYYY","MMM DD, YYYY"];

export const DEFAULT_SETTINGS = {
  currency: "$", currencyPos: "before", dateFormat: "YYYY-MM-DD",
  language: "en", decimalSep: ".", thousandSep: ",", showCents: true, defaultTab: "dashboard", theme: "light",
  investAmount: 0, investDate: "", investIncludeEquip: true,
  oilInterval: 90
};

export const TABS = [
  ["dashboard","home","Home"],
  ["graphs","chart","Graphs"],
  ["growth","trend","Growth"],
  ["transactions","list","History"],
  ["categories","tag","More"]
];

export const BACKUP_PREFIX = "ServiceTracker_Backup_";
