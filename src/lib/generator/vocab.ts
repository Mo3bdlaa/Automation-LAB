/**
 * Word lists for the generators. Everything here is fictional. Names are
 * chosen to look regional (bilingual EN/AR) without matching real companies.
 */

export const COMPANY = {
  name: "Al-Nahda Trading & Contracting Co.",
  nameAr: "شركة النهضة للتجارة والمقاولات",
  shortName: "Al-Nahda",
  crNumber: "1010456784",
  taxId: "300124587600003",
  addressLine: "Building 14, King Fahd Road, Al Olaya",
  addressLineAr: "مبنى ١٤، طريق الملك فهد، العليا",
  city: "Riyadh",
  cityAr: "الرياض",
  country: "SA",
  phone: "+966 11 555 0100",
  email: "procurement@al-nahda.example",
  currency: "SAR",
} as const;

export const VENDOR_FIRST = [
  ["Al Faisal", "الفيصل"], ["Al Noor", "النور"], ["Gulf", "الخليج"], ["Arabian", "العربية"],
  ["Eastern", "الشرقية"], ["National", "الوطنية"], ["United", "المتحدة"], ["Al Salam", "السلام"],
  ["Modern", "الحديثة"], ["Premier", "الأولى"], ["Al Manar", "المنار"], ["Horizon", "الأفق"],
  ["Crescent", "الهلال"], ["Al Rawabi", "الروابي"], ["Delta", "دلتا"], ["Al Amal", "الأمل"],
  ["Pioneer", "الرواد"], ["Golden Sands", "الرمال الذهبية"], ["Al Baraka", "البركة"], ["Summit", "القمة"],
  ["Al Waha", "الواحة"], ["Nile", "النيل"], ["Al Yamama", "اليمامة"], ["Oasis", "الواحة"],
  ["Al Hikma", "الحكمة"], ["Falcon", "الصقر"], ["Al Diyar", "الديار"], ["Blue Sea", "البحر الأزرق"],
  ["Al Qimma", "القمة"], ["Sahara", "الصحراء"], ["Al Jazeera", "الجزيرة"], ["Al Ain", "العين"],
] as const;

export const VENDOR_SECOND = [
  ["Trading", "للتجارة"], ["Supplies", "للتوريدات"], ["Industries", "للصناعات"], ["Logistics", "للخدمات اللوجستية"],
  ["Technologies", "للتقنية"], ["Contracting", "للمقاولات"], ["Equipment", "للمعدات"], ["Stationery", "للقرطاسية"],
  ["Electronics", "للإلكترونيات"], ["Building Materials", "لمواد البناء"], ["Packaging", "للتعبئة والتغليف"],
  ["Medical Supplies", "للمستلزمات الطبية"], ["Food Services", "للخدمات الغذائية"], ["Printing", "للطباعة"],
  ["Maintenance", "للصيانة"], ["Safety Equipment", "لمعدات السلامة"], ["Furniture", "للأثاث"],
  ["Chemicals", "للكيماويات"], ["IT Solutions", "لحلول تقنية المعلومات"], ["Cleaning Services", "لخدمات النظافة"],
] as const;

export const LEGAL_FORMS = [
  ["LLC", "ذ.م.م"], ["Est.", "مؤسسة"], ["Co.", "شركة"], ["JSC", "ش.م.س"], ["Ltd.", "المحدودة"],
] as const;

export const VENDOR_CATEGORIES = [
  "Office Supplies", "IT Hardware", "IT Services", "Facilities", "Logistics", "Raw Materials",
  "Packaging", "Safety", "Furniture", "Printing", "Medical", "Catering", "Maintenance", "Construction",
] as const;

export const CITIES = [
  ["Riyadh", "الرياض", "SA"], ["Jeddah", "جدة", "SA"], ["Dammam", "الدمام", "SA"], ["Khobar", "الخبر", "SA"],
  ["Dubai", "دبي", "AE"], ["Abu Dhabi", "أبوظبي", "AE"], ["Sharjah", "الشارقة", "AE"],
  ["Cairo", "القاهرة", "EG"], ["Alexandria", "الإسكندرية", "EG"], ["Giza", "الجيزة", "EG"],
  ["Doha", "الدوحة", "QA"], ["Manama", "المنامة", "BH"], ["Kuwait City", "مدينة الكويت", "KW"],
  ["Muscat", "مسقط", "OM"], ["Amman", "عمّان", "JO"],
] as const;

export const STREETS = [
  "King Abdulaziz Road", "Prince Sultan Street", "Olaya Street", "Al Tahlia Street", "Industrial Area 2",
  "Sheikh Zayed Road", "Al Khalij Street", "Salah Salem Road", "Corniche Road", "Airport Road",
  "Al Madina Road", "Exit 10, Eastern Ring Road", "Al Nahda Street", "Port Road", "Second Industrial City",
];

export const FIRST_NAMES = [
  "Ahmed", "Mohammed", "Khalid", "Omar", "Faisal", "Sara", "Noura", "Huda", "Layla", "Mariam",
  "Yousef", "Abdullah", "Salem", "Hassan", "Tariq", "Reem", "Dana", "Amal", "Fatima", "Rania",
  "Ibrahim", "Majed", "Nasser", "Sultan", "Ziad", "Lina", "Hala", "Maha", "Nada", "Aisha",
];

export const LAST_NAMES = [
  "Al-Otaibi", "Al-Harbi", "Al-Qahtani", "Al-Ghamdi", "Al-Shehri", "Al-Zahrani", "Al-Dossari",
  "Al-Mutairi", "Hassan", "Mahmoud", "Ibrahim", "Saleh", "Khalil", "Mansour", "Farouk", "Nassar",
  "Al-Amri", "Al-Balushi", "Haddad", "Sabbagh", "Karam", "Youssef", "Abdelrahman", "Al-Sayed",
];

export const ITEM_CATEGORIES: readonly { name: string; nameAr: string; uoms: readonly string[]; taxCodes: readonly string[]; price: [number, number]; nouns: readonly (readonly [string, string])[] }[] = [
  {
    name: "Office Supplies", nameAr: "مستلزمات مكتبية", uoms: ["EA", "BOX", "PK", "RM"], taxCodes: ["S15"], price: [2, 120],
    nouns: [["Copy Paper A4 80gsm", "ورق تصوير A4 80 جم"], ["Ballpoint Pen", "قلم حبر جاف"], ["Stapler", "دباسة"], ["Ring Binder", "ملف حلقات"], ["Sticky Notes", "ملاحظات لاصقة"], ["Toner Cartridge", "خرطوشة حبر"], ["Whiteboard Marker", "قلم سبورة"], ["Envelope DL", "ظرف DL"], ["Lever Arch File", "ملف ذراع"], ["Correction Tape", "شريط تصحيح"]],
  },
  {
    name: "IT Hardware", nameAr: "أجهزة تقنية", uoms: ["EA", "SET"], taxCodes: ["S15"], price: [45, 9500],
    nouns: [["Laptop 14in i7 16GB", "حاسوب محمول 14 بوصة"], ["USB-C Docking Station", "قاعدة توصيل USB-C"], ["27in Monitor", "شاشة 27 بوصة"], ["Wireless Keyboard", "لوحة مفاتيح لاسلكية"], ["Network Switch 24-port", "محول شبكة 24 منفذ"], ["SSD 1TB NVMe", "قرص SSD 1 تيرابايت"], ["Barcode Scanner", "ماسح باركود"], ["Label Printer", "طابعة ملصقات"], ["Webcam 1080p", "كاميرا ويب"], ["UPS 1500VA", "مزود طاقة احتياطي"]],
  },
  {
    name: "Facilities", nameAr: "مرافق", uoms: ["EA", "BOX", "L", "KG"], taxCodes: ["S15", "S05"], price: [5, 800],
    nouns: [["Floor Cleaner 5L", "منظف أرضيات 5 لتر"], ["Paper Towels", "مناشف ورقية"], ["LED Tube 18W", "أنبوب LED 18 واط"], ["Air Filter", "فلتر هواء"], ["Hand Sanitizer 500ml", "معقم يدين 500 مل"], ["Trash Bags 50L", "أكياس قمامة 50 لتر"], ["Door Closer", "غلاق باب"], ["Fire Extinguisher 6kg", "طفاية حريق 6 كجم"], ["Water Dispenser", "مبرد مياه"], ["Extension Cord 5m", "وصلة كهرباء 5 متر"]],
  },
  {
    name: "Packaging", nameAr: "تغليف", uoms: ["EA", "BOX", "ROLL", "PLT"], taxCodes: ["S15"], price: [1, 350],
    nouns: [["Carton Box 40x30x30", "كرتون 40×30×30"], ["Stretch Film Roll", "لفة فيلم تغليف"], ["Packing Tape", "شريط تغليف"], ["Bubble Wrap Roll", "لفة فقاعات"], ["Wooden Pallet", "منصة خشبية"], ["Strapping Band", "شريط تحزيم"], ["Label Roll 100x150", "لفة ملصقات"], ["Foam Sheet", "لوح فوم"]],
  },
  {
    name: "Safety", nameAr: "سلامة", uoms: ["EA", "PR", "BOX"], taxCodes: ["S15"], price: [3, 600],
    nouns: [["Safety Helmet", "خوذة سلامة"], ["Safety Boots", "حذاء سلامة"], ["Hi-Vis Vest", "سترة عاكسة"], ["Nitrile Gloves", "قفازات نيتريل"], ["Safety Goggles", "نظارات واقية"], ["Ear Plugs", "سدادات أذن"], ["First Aid Kit", "حقيبة إسعافات أولية"], ["Harness", "حزام أمان"]],
  },
  {
    name: "Raw Materials", nameAr: "مواد خام", uoms: ["KG", "TON", "M", "L", "BAG"], taxCodes: ["S15", "Z00"], price: [0.5, 4200],
    nouns: [["Steel Rebar 12mm", "حديد تسليح 12 مم"], ["Cement OPC 50kg", "أسمنت بورتلاندي 50 كجم"], ["Copper Wire 2.5mm", "سلك نحاس 2.5 مم"], ["PVC Pipe 4in", "أنبوب PVC 4 بوصة"], ["Sand (washed)", "رمل مغسول"], ["Aluminium Sheet 2mm", "لوح ألومنيوم 2 مم"], ["Industrial Solvent", "مذيب صناعي"], ["Plywood 18mm", "خشب رقائقي 18 مم"]],
  },
  {
    name: "Furniture", nameAr: "أثاث", uoms: ["EA", "SET"], taxCodes: ["S15"], price: [90, 4800],
    nouns: [["Office Chair Ergonomic", "كرسي مكتب مريح"], ["Desk 160x80", "مكتب 160×80"], ["Filing Cabinet 4-drawer", "خزانة ملفات 4 أدراج"], ["Meeting Table 8-seat", "طاولة اجتماعات 8 مقاعد"], ["Bookshelf", "رف كتب"], ["Reception Sofa", "أريكة استقبال"], ["Locker 6-door", "خزانة 6 أبواب"]],
  },
  {
    name: "Medical", nameAr: "طبي", uoms: ["EA", "BOX", "PK"], taxCodes: ["Z00", "EXM"], price: [4, 2500],
    nouns: [["Surgical Mask (50)", "كمامة جراحية (50)"], ["Digital Thermometer", "ميزان حرارة رقمي"], ["Blood Pressure Monitor", "جهاز قياس ضغط"], ["Examination Gloves", "قفازات فحص"], ["Wheelchair", "كرسي متحرك"], ["Pulse Oximeter", "مقياس أكسجين"]],
  },
  {
    name: "Catering", nameAr: "تموين", uoms: ["EA", "BOX", "KG", "CTN"], taxCodes: ["S15", "S05"], price: [3, 400],
    nouns: [["Mineral Water 24x500ml", "مياه معدنية 24×500 مل"], ["Arabic Coffee 1kg", "قهوة عربية 1 كجم"], ["Tea Bags (100)", "أكياس شاي (100)"], ["Paper Cups (50)", "أكواب ورقية (50)"], ["Sugar Sachets (500)", "أكياس سكر (500)"], ["Dates 5kg", "تمر 5 كجم"]],
  },
  {
    name: "Printing", nameAr: "طباعة", uoms: ["EA", "PK", "RM"], taxCodes: ["S15"], price: [1, 900],
    nouns: [["Business Cards (500)", "بطاقات عمل (500)"], ["Brochure A5 Tri-fold", "كتيب A5"], ["Roll-up Banner", "لافتة قابلة للطي"], ["Letterhead (1000)", "ورق رسمي (1000)"], ["ID Card PVC", "بطاقة تعريف PVC"], ["Vinyl Sticker Sheet", "ورقة ملصقات فينيل"]],
  },
];

export const ITEM_VARIANTS = ["", "Standard", "Premium", "Economy", "Heavy Duty", "Type A", "Type B", "Blue", "Black", "White", "Large", "Small"];

export const COST_CENTERS = [
  ["CC-100", "Executive Office", "المكتب التنفيذي"], ["CC-110", "Finance", "المالية"], ["CC-120", "Human Resources", "الموارد البشرية"],
  ["CC-130", "Procurement", "المشتريات"], ["CC-200", "Operations", "العمليات"], ["CC-210", "Warehouse", "المستودع"],
  ["CC-220", "Logistics", "الخدمات اللوجستية"], ["CC-300", "Sales", "المبيعات"], ["CC-310", "Marketing", "التسويق"],
  ["CC-400", "IT", "تقنية المعلومات"], ["CC-410", "Facilities", "المرافق"], ["CC-500", "Projects", "المشاريع"],
  ["CC-510", "Engineering", "الهندسة"], ["CC-600", "Quality & HSE", "الجودة والسلامة"], ["CC-700", "Customer Service", "خدمة العملاء"],
] as const;

export const GL_ACCOUNTS: readonly (readonly [string, string, "expense" | "asset" | "liability" | "revenue" | "equity"])[] = [
  ["1100", "Cash and Bank", "asset"], ["1200", "Accounts Receivable", "asset"], ["1300", "Inventory - Raw Materials", "asset"],
  ["1310", "Inventory - Finished Goods", "asset"], ["1400", "Prepaid Expenses", "asset"], ["1500", "Property, Plant & Equipment", "asset"],
  ["1510", "IT Equipment", "asset"], ["1520", "Furniture & Fixtures", "asset"], ["1600", "Accumulated Depreciation", "asset"],
  ["2100", "Accounts Payable", "liability"], ["2200", "VAT Payable", "liability"], ["2300", "Accrued Expenses", "liability"],
  ["2400", "Short-term Loans", "liability"], ["3100", "Share Capital", "equity"], ["3200", "Retained Earnings", "equity"],
  ["4100", "Sales Revenue", "revenue"], ["4200", "Service Revenue", "revenue"], ["4900", "Other Income", "revenue"],
  ["5100", "Cost of Goods Sold", "expense"], ["6100", "Office Supplies Expense", "expense"], ["6110", "Printing & Stationery", "expense"],
  ["6200", "IT Expenses", "expense"], ["6210", "Software Subscriptions", "expense"], ["6300", "Facilities & Maintenance", "expense"],
  ["6310", "Cleaning Services", "expense"], ["6320", "Utilities", "expense"], ["6400", "Packaging Materials", "expense"],
  ["6500", "Safety & PPE", "expense"], ["6600", "Freight & Logistics", "expense"], ["6700", "Catering & Hospitality", "expense"],
  ["6800", "Medical & First Aid", "expense"], ["6900", "Professional Fees", "expense"], ["7100", "Salaries & Wages", "expense"],
  ["7200", "Training & Development", "expense"], ["7300", "Travel", "expense"], ["7400", "Marketing & Advertising", "expense"],
  ["7500", "Depreciation", "expense"], ["7600", "Insurance", "expense"], ["7700", "Bank Charges", "expense"], ["7900", "Miscellaneous Expense", "expense"],
];

export const GL_BY_CATEGORY: Record<string, string> = {
  "Office Supplies": "6100", "IT Hardware": "1510", "Facilities": "6300", "Packaging": "6400", "Safety": "6500",
  "Raw Materials": "1300", "Furniture": "1520", "Medical": "6800", "Catering": "6700", "Printing": "6110",
};

export const DELIVERY_LOCATIONS = [
  ["WH-RUH-01", "Riyadh Central Warehouse", "Exit 18, Second Industrial City", "Riyadh"],
  ["WH-RUH-02", "Riyadh North Depot", "Al Sulay Industrial Area", "Riyadh"],
  ["WH-JED-01", "Jeddah Port Warehouse", "Islamic Port Road, Zone 4", "Jeddah"],
  ["WH-DMM-01", "Dammam Logistics Hub", "First Industrial City, Street 7", "Dammam"],
  ["HQ-RUH", "Head Office Receiving", "Building 14, King Fahd Road", "Riyadh"],
  ["SITE-A", "Project Site A", "Al Kharj Road, km 42", "Riyadh"],
  ["SITE-B", "Project Site B", "Yanbu Industrial City, Plot 233", "Yanbu"],
  ["BR-KHB", "Khobar Branch", "Prince Turki Street", "Khobar"],
] as const;

export const PAYMENT_TERMS = [0, 15, 30, 45, 60, 90] as const;
export const CURRENCY_BY_COUNTRY: Record<string, string> = { SA: "SAR", AE: "AED", EG: "EGP", QA: "QAR", BH: "BHD", KW: "KWD", OM: "OMR", JO: "JOD", GB: "GBP", DE: "EUR" };
