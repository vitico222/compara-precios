/* ========================================== */
/* CATALOG-DATA.JS - CATÁLOGO ESTÁNDAR DE PRODUCTOS */
/* ========================================== */
/*
  REGLAS PARA EDITAR ESTE ARCHIVO
  1. "name" debe estar ya normalizado: minúsculas, sin acentos ni ñ, sin símbolos
     y con las medidas en formato estándar (1kg, 500g, 1l, 1.5l, 500ml, x6).
     Es exactamente lo que produce normalizeProductName() en utils.js.
  2. "name" es la CLAVE con la que se agrupan los precios de la comunidad.
     Si lo cambias, los precios guardados con el nombre anterior dejan de contarse.
  3. "keywords" también va sin acentos. Agrega sinónimos regionales y marcas
     (ej. cambur/banano/guineo, caraotas/frijoles/porotos): ayudan a que el
     emparejamiento aproximado reconozca el producto en distintos países.
  4. Los productos que se venden por peso (frutas, verduras, carnes) se
     comparan por precio de 1kg.
  5. Los "id" no se reutilizan. Para agregar productos, usa el siguiente número libre.
*/

const initialCatalogData = [
  // ==========================================
  // 1. VÍVERES Y ABARROTES
  // ==========================================
  {
    id: "prod_001",
    name: "azucar refinada 1kg",
    category: "Víveres",
    keywords: ["azucar", "refinada", "blanca"],
  },
  {
    id: "prod_002",
    name: "azucar morena 1kg",
    category: "Víveres",
    keywords: ["azucar", "morena", "mascabado"],
  },
  {
    id: "prod_003",
    name: "harina de maiz precocida 1kg",
    category: "Víveres",
    keywords: [
      "harina",
      "maiz",
      "precocida",
      "arepas",
      "pan",
      "juana",
      "mazeca",
    ],
  },
  {
    id: "prod_004",
    name: "harina de maiz amarilla 1kg",
    category: "Víveres",
    keywords: ["harina", "maiz", "amarilla"],
  },
  {
    id: "prod_005",
    name: "arroz blanco grano mediano 1kg",
    category: "Víveres",
    keywords: ["arroz", "blanco", "grano", "mediano"],
  },
  {
    id: "prod_006",
    name: "arroz blanco grano largo 1kg",
    category: "Víveres",
    keywords: ["arroz", "blanco", "largo", "fino"],
  },
  {
    id: "prod_221",
    name: "arroz integral 1kg",
    category: "Víveres",
    keywords: ["arroz", "integral"],
  },
  {
    id: "prod_007",
    name: "pasta alimenticia espagueti 1kg",
    category: "Víveres",
    keywords: ["pasta", "espagueti", "spaghetti", "tallarin"],
  },
  {
    id: "prod_008",
    name: "pasta alimenticia corta 1kg",
    category: "Víveres",
    keywords: ["pasta", "corta", "penne", "macarron", "coditos"],
  },
  {
    id: "prod_009",
    name: "aceite vegetal de maiz 1l",
    category: "Víveres",
    keywords: ["aceite", "vegetal", "maiz"],
  },
  {
    id: "prod_010",
    name: "aceite vegetal de girasol 1l",
    category: "Víveres",
    keywords: ["aceite", "girasol", "vegetal"],
  },
  {
    id: "prod_011",
    name: "aceite de oliva extra virgen 500ml",
    category: "Víveres",
    keywords: ["aceite", "oliva", "virgen"],
  },
  {
    id: "prod_012",
    name: "caraotas negras 1kg",
    category: "Víveres",
    keywords: ["caraotas", "frijoles negros", "porotos negros", "granos"],
  },
  {
    id: "prod_013",
    name: "frijoles rojos 1kg",
    category: "Víveres",
    keywords: ["frijoles", "rojos", "porotos", "habichuelas", "granos"],
  },
  {
    id: "prod_222",
    name: "garbanzos 1kg",
    category: "Víveres",
    keywords: ["garbanzos", "granos"],
  },
  {
    id: "prod_014",
    name: "lentejas 1kg",
    category: "Víveres",
    keywords: ["lentejas", "granos"],
  },
  {
    id: "prod_015",
    name: "arvejas amarillas 1kg",
    category: "Víveres",
    keywords: ["arvejas", "amarillas", "chicharos", "guisantes", "granos"],
  },
  {
    id: "prod_016",
    name: "sal de mesa yodada 1kg",
    category: "Víveres",
    keywords: ["sal", "mesa", "yodada"],
  },
  {
    id: "prod_017",
    name: "atun enlatado en aceite 170g",
    category: "Víveres",
    keywords: ["atun", "enlatado", "aceite", "lomo"],
  },
  {
    id: "prod_018",
    name: "atun enlatado en agua 170g",
    category: "Víveres",
    keywords: ["atun", "enlatado", "agua", "lomo"],
  },
  {
    id: "prod_019",
    name: "sardinas en salsa de tomate 170g",
    category: "Víveres",
    keywords: ["sardinas", "tomate", "enlatado"],
  },
  {
    id: "prod_020",
    name: "maiz dulce enlatado 300g",
    category: "Víveres",
    keywords: ["maiz", "dulce", "choclo", "elote", "enlatado"],
  },
  {
    id: "prod_021",
    name: "pasta de tomate 400g",
    category: "Víveres",
    keywords: ["pasta", "tomate", "salsa", "concentrado"],
  },
  {
    id: "prod_022",
    name: "salsa de tomate ketchup 400g",
    category: "Víveres",
    keywords: ["ketchup", "catsup", "salsa", "tomate"],
  },
  {
    id: "prod_023",
    name: "mayonesa 400g",
    category: "Víveres",
    keywords: ["mayonesa", "aderezo", "salsa"],
  },
  {
    id: "prod_024",
    name: "mostaza 390g",
    category: "Víveres",
    keywords: ["mostaza", "aderezo"],
  },
  {
    id: "prod_025",
    name: "vinagre blanco 1l",
    category: "Víveres",
    keywords: ["vinagre", "blanco"],
  },
  {
    id: "prod_026",
    name: "salsa inglesa 300ml",
    category: "Víveres",
    keywords: ["salsa", "inglesa", "worcestershire"],
  },
  {
    id: "prod_027",
    name: "salsa de soya 300ml",
    category: "Víveres",
    keywords: ["salsa", "soya", "soja"],
  },
  {
    id: "prod_028",
    name: "harina de trigo leudante 1kg",
    category: "Víveres",
    keywords: ["harina", "trigo", "leudante", "con polvo"],
  },
  {
    id: "prod_029",
    name: "harina de trigo todo uso 1kg",
    category: "Víveres",
    keywords: ["harina", "trigo", "todo uso"],
  },
  {
    id: "prod_030",
    name: "avena en hojuelas 400g",
    category: "Víveres",
    keywords: ["avena", "hojuelas", "cereal"],
  },
  {
    id: "prod_031",
    name: "cereal de maiz azucarado 500g",
    category: "Víveres",
    keywords: ["cereal", "maiz", "flakes", "zucaritas"],
  },
  {
    id: "prod_032",
    name: "cafe molido 500g",
    category: "Víveres",
    keywords: ["cafe", "molido", "tostado"],
  },
  {
    id: "prod_033",
    name: "cafe soluble instantaneo 200g",
    category: "Víveres",
    keywords: ["cafe", "soluble", "instantaneo"],
  },
  {
    id: "prod_034",
    name: "te negro en saquitos x20",
    category: "Víveres",
    keywords: ["te", "negro", "infusion", "saquitos"],
  },
  {
    id: "prod_035",
    name: "manzanilla en saquitos x20",
    category: "Víveres",
    keywords: ["manzanilla", "infusion", "te", "saquitos"],
  },
  {
    id: "prod_036",
    name: "galletas dulces surtidas 400g",
    category: "Víveres",
    keywords: ["galletas", "dulces", "surtidas"],
  },
  {
    id: "prod_037",
    name: "galletas maria 200g",
    category: "Víveres",
    keywords: ["galletas", "maria"],
  },
  {
    id: "prod_038",
    name: "galletas soda saladas 300g",
    category: "Víveres",
    keywords: ["galletas", "soda", "saladas", "crackers"],
  },
  {
    id: "prod_039",
    name: "chocolate con leche tableta 100g",
    category: "Víveres",
    keywords: ["chocolate", "leche", "tableta", "dulce"],
  },
  {
    id: "prod_223",
    name: "chocolate en polvo 400g",
    category: "Víveres",
    keywords: ["chocolate", "polvo", "cacao", "achocolatado"],
  },
  {
    id: "prod_224",
    name: "mermelada de fresa 500g",
    category: "Víveres",
    keywords: ["mermelada", "fresa", "jalea", "dulce"],
  },
  {
    id: "prod_225",
    name: "leche condensada 395g",
    category: "Víveres",
    keywords: ["leche", "condensada", "lechera"],
  },
  {
    id: "prod_040",
    name: "pan de sandwich molde blanco 500g",
    category: "Víveres",
    keywords: ["pan", "sandwich", "molde", "blanco", "tostado"],
  },
  {
    id: "prod_041",
    name: "pan de hamburguesa paquete x6",
    category: "Víveres",
    keywords: ["pan", "hamburguesa"],
  },
  {
    id: "prod_042",
    name: "pan de perro caliente paquete x8",
    category: "Víveres",
    keywords: ["pan", "perro", "hot dog", "salchicha"],
  },
  {
    id: "prod_043",
    name: "gelatina en polvo sabor fresa 80g",
    category: "Víveres",
    keywords: ["gelatina", "fresa", "postre"],
  },
  {
    id: "prod_044",
    name: "flan en polvo 80g",
    category: "Víveres",
    keywords: ["flan", "postre"],
  },
  {
    id: "prod_045",
    name: "cubitos de caldo de pollo x12",
    category: "Víveres",
    keywords: ["cubitos", "caldo", "pollo", "maggi", "sazonador"],
  },
  {
    id: "prod_046",
    name: "sopa de sobre de pollo con fideos 60g",
    category: "Víveres",
    keywords: ["sopa", "sobre", "fideos", "pollo"],
  },
  {
    id: "prod_047",
    name: "maicena fecula de maiz 400g",
    category: "Víveres",
    keywords: ["maicena", "fecula", "maiz", "almidon"],
  },
  {
    id: "prod_048",
    name: "polvo para hornear 200g",
    category: "Víveres",
    keywords: ["polvo", "hornear", "royal", "levadura quimica"],
  },
  {
    id: "prod_049",
    name: "esencia de vainilla 30ml",
    category: "Víveres",
    keywords: ["vainilla", "esencia", "saborizante"],
  },
  {
    id: "prod_226",
    name: "pimienta negra molida 50g",
    category: "Víveres",
    keywords: ["pimienta", "negra", "molida", "especias"],
  },
  {
    id: "prod_227",
    name: "oregano seco 20g",
    category: "Víveres",
    keywords: ["oregano", "seco", "especias"],
  },

  // ==========================================
  // 2. LÁCTEOS Y HUEVOS
  // ==========================================
  {
    id: "prod_050",
    name: "leche entera en polvo 900g",
    category: "Lácteos",
    keywords: ["leche", "en polvo", "entera"],
  },
  {
    id: "prod_051",
    name: "leche descremada en polvo 900g",
    category: "Lácteos",
    keywords: ["leche", "en polvo", "descremada"],
  },
  {
    id: "prod_052",
    name: "leche completa pasteurizada 1l",
    category: "Lácteos",
    keywords: ["leche", "completa", "entera", "pasteurizada", "liquida"],
  },
  {
    id: "prod_053",
    name: "leche deslactosada 1l",
    category: "Lácteos",
    keywords: ["leche", "deslactosada", "sin lactosa"],
  },
  {
    id: "prod_054",
    name: "queso blanco duro 1kg",
    category: "Lácteos",
    keywords: ["queso", "blanco", "duro", "llanero", "rallar"],
  },
  {
    id: "prod_055",
    name: "queso blanco semiduro 1kg",
    category: "Lácteos",
    keywords: ["queso", "blanco", "semiduro", "telita"],
  },
  {
    id: "prod_056",
    name: "queso amarillo tipo gouda 1kg",
    category: "Lácteos",
    keywords: ["queso", "amarillo", "gouda", "edam"],
  },
  {
    id: "prod_057",
    name: "queso crema 200g",
    category: "Lácteos",
    keywords: ["queso", "crema", "untable", "philadelphia"],
  },
  {
    id: "prod_058",
    name: "mantequilla con sal 500g",
    category: "Lácteos",
    keywords: ["mantequilla", "con sal"],
  },
  {
    id: "prod_059",
    name: "margarina sin sal 500g",
    category: "Lácteos",
    keywords: ["margarina", "sin sal", "mavesa"],
  },
  {
    id: "prod_060",
    name: "yogurt bebible sabor fresa 1l",
    category: "Lácteos",
    keywords: ["yogurt", "yogur", "fresa", "bebible"],
  },
  {
    id: "prod_061",
    name: "yogurt natural 1l",
    category: "Lácteos",
    keywords: ["yogurt", "yogur", "natural"],
  },
  {
    id: "prod_062",
    name: "crema de leche 200ml",
    category: "Lácteos",
    keywords: ["crema", "leche", "nata"],
  },
  {
    id: "prod_063",
    name: "carton de huevos grandes x30",
    category: "Lácteos",
    keywords: ["huevos", "carton", "30"],
  },
  {
    id: "prod_064",
    name: "media docena de huevos x6",
    category: "Lácteos",
    keywords: ["huevos", "docena", "6"],
  },
  {
    id: "prod_065",
    name: "queso mozzarella 1kg",
    category: "Lácteos",
    keywords: ["queso", "mozzarella", "mozarella", "pizza"],
  },
  {
    id: "prod_066",
    name: "ricotta 250g",
    category: "Lácteos",
    keywords: ["ricotta", "requeson"],
  },
  {
    id: "prod_072",
    name: "queso de mano 1kg",
    category: "Lácteos",
    keywords: ["queso", "mano"],
  },

  // ==========================================
  // 3. EMBUTIDOS, CARNES Y PESCADOS
  // ==========================================
  {
    id: "prod_070",
    name: "jamon de pierna ahumado 1kg",
    category: "Embutidos",
    keywords: ["jamon", "pierna", "ahumado"],
  },
  {
    id: "prod_071",
    name: "jamon de pavo 1kg",
    category: "Embutidos",
    keywords: ["jamon", "pavo", "turkey"],
  },
  {
    id: "prod_073",
    name: "salchichas tipo viena paquete x6",
    category: "Embutidos",
    keywords: ["salchichas", "viena", "perro"],
  },
  {
    id: "prod_074",
    name: "tocineta ahumada 250g",
    category: "Embutidos",
    keywords: ["tocineta", "bacon", "panceta", "ahumada"],
  },
  {
    id: "prod_075",
    name: "mortadela de pollo 1kg",
    category: "Embutidos",
    keywords: ["mortadela", "pollo"],
  },
  {
    id: "prod_076",
    name: "mortadela especial 1kg",
    category: "Embutidos",
    keywords: ["mortadela", "especial"],
  },
  {
    id: "prod_077",
    name: "carne de res para desmechar 1kg",
    category: "Carnes",
    keywords: ["carne", "res", "falda", "desmechar", "mechada"],
  },
  {
    id: "prod_078",
    name: "carne de res molida 1kg",
    category: "Carnes",
    keywords: ["carne", "molida", "res"],
  },
  {
    id: "prod_079",
    name: "bistec de res 1kg",
    category: "Carnes",
    keywords: ["bistec", "res", "carne", "bife"],
  },
  {
    id: "prod_080",
    name: "costilla de res 1kg",
    category: "Carnes",
    keywords: ["costilla", "res"],
  },
  {
    id: "prod_081",
    name: "pollo entero con piel 1kg",
    category: "Carnes",
    keywords: ["pollo", "entero", "fresco"],
  },
  {
    id: "prod_082",
    name: "pechuga de pollo con hueso 1kg",
    category: "Carnes",
    keywords: ["pechuga", "pollo"],
  },
  {
    id: "prod_083",
    name: "milanesa de pollo fileteada 1kg",
    category: "Carnes",
    keywords: ["milanesa", "pollo", "filete"],
  },
  {
    id: "prod_084",
    name: "alitas de pollo 1kg",
    category: "Carnes",
    keywords: ["alitas", "pollo"],
  },
  {
    id: "prod_085",
    name: "muslos de pollo 1kg",
    category: "Carnes",
    keywords: ["muslos", "pollo", "pernil"],
  },
  {
    id: "prod_086",
    name: "costillas de cerdo 1kg",
    category: "Carnes",
    keywords: ["costillas", "cerdo", "puerco"],
  },
  {
    id: "prod_087",
    name: "chuleta de cerdo ahumada 1kg",
    category: "Carnes",
    keywords: ["chuleta", "cerdo", "ahumada"],
  },
  {
    id: "prod_088",
    name: "carne de cerdo para guisar 1kg",
    category: "Carnes",
    keywords: ["cerdo", "guisar", "puerco"],
  },
  {
    id: "prod_089",
    name: "pescado filete de merluza 1kg",
    category: "Pescados",
    keywords: ["pescado", "merluza", "filete"],
  },
  {
    id: "prod_090",
    name: "pescado atun fresco 1kg",
    category: "Pescados",
    keywords: ["atun", "fresco", "pescado"],
  },
  {
    id: "prod_091",
    name: "camarones enteros 500g",
    category: "Pescados",
    keywords: ["camarones", "gambas", "mariscos"],
  },

  // ==========================================
  // 4. FRUTAS Y VERDURAS
  // ==========================================
  {
    id: "prod_100",
    name: "papa blanca comercial 1kg",
    category: "Verduras",
    keywords: ["papa", "blanca", "patata"],
  },
  {
    id: "prod_101",
    name: "cebolla 1kg",
    category: "Verduras",
    keywords: ["cebolla", "blanca", "amarilla"],
  },
  {
    id: "prod_102",
    name: "tomate rojo perita 1kg",
    category: "Verduras",
    keywords: ["tomate", "perita", "rojo", "jitomate"],
  },
  {
    id: "prod_103",
    name: "zanahoria fresca 1kg",
    category: "Verduras",
    keywords: ["zanahoria"],
  },
  {
    id: "prod_104",
    name: "pimenton 1kg",
    category: "Verduras",
    keywords: ["pimenton", "morron", "aji", "verde", "rojo"],
  },
  {
    id: "prod_105",
    name: "ajo cabeza entero 1kg",
    category: "Verduras",
    keywords: ["ajo", "cabezas"],
  },
  {
    id: "prod_106",
    name: "cilantro fresco manojo",
    category: "Verduras",
    keywords: ["cilantro", "hierbas"],
  },
  {
    id: "prod_107",
    name: "cebollin manojo",
    category: "Verduras",
    keywords: ["cebollin", "ciboulette", "cebolleta"],
  },
  {
    id: "prod_108",
    name: "apio espana ramita",
    category: "Verduras",
    keywords: ["apio", "espana", "celery"],
  },
  {
    id: "prod_109",
    name: "yuca raiz fresca 1kg",
    category: "Verduras",
    keywords: ["yuca", "mandioca"],
  },
  {
    id: "prod_110",
    name: "ocumo blanco 1kg",
    category: "Verduras",
    keywords: ["ocumo", "tuberculo", "malanga"],
  },
  {
    id: "prod_111",
    name: "name fresco 1kg",
    category: "Verduras",
    keywords: ["name", "tuberculo"],
  },
  {
    id: "prod_112",
    name: "platano 1kg",
    category: "Verduras",
    keywords: ["platano", "plantano", "verde", "maduro", "topocho"],
  },
  {
    id: "prod_113",
    name: "auyama calabaza trozada 1kg",
    category: "Verduras",
    keywords: ["auyama", "calabaza", "zapallo"],
  },
  {
    id: "prod_114",
    name: "repollo blanco 1kg",
    category: "Verduras",
    keywords: ["repollo", "col"],
  },
  {
    id: "prod_115",
    name: "lechuga romana 1kg",
    category: "Verduras",
    keywords: ["lechuga", "romana", "ensalada"],
  },
  {
    id: "prod_116",
    name: "pepino 1kg",
    category: "Verduras",
    keywords: ["pepino", "pepinillo"],
  },
  {
    id: "prod_228",
    name: "aguacate 1kg",
    category: "Verduras",
    keywords: ["aguacate", "palta"],
  },
  {
    id: "prod_229",
    name: "calabacin 1kg",
    category: "Verduras",
    keywords: ["calabacin", "zucchini", "zapallito"],
  },
  {
    id: "prod_117",
    name: "cambur 1kg",
    category: "Frutas",
    keywords: ["cambur", "banana", "banano", "guineo", "titi"],
  },
  {
    id: "prod_118",
    name: "manzana roja importada 1kg",
    category: "Frutas",
    keywords: ["manzana", "roja"],
  },
  {
    id: "prod_119",
    name: "manzana verde importada 1kg",
    category: "Frutas",
    keywords: ["manzana", "verde"],
  },
  {
    id: "prod_120",
    name: "pera importada 1kg",
    category: "Frutas",
    keywords: ["pera"],
  },
  {
    id: "prod_121",
    name: "naranja para jugo 1kg",
    category: "Frutas",
    keywords: ["naranja", "jugo"],
  },
  {
    id: "prod_230",
    name: "mandarina 1kg",
    category: "Frutas",
    keywords: ["mandarina", "clementina"],
  },
  {
    id: "prod_122",
    name: "limon criollo 1kg",
    category: "Frutas",
    keywords: ["limon", "lima"],
  },
  {
    id: "prod_123",
    name: "patilla entera 1kg",
    category: "Frutas",
    keywords: ["patilla", "sandia"],
  },
  {
    id: "prod_124",
    name: "melon entero 1kg",
    category: "Frutas",
    keywords: ["melon"],
  },
  {
    id: "prod_125",
    name: "lechoza entera 1kg",
    category: "Frutas",
    keywords: ["lechoza", "papaya", "fruta bomba"],
  },
  {
    id: "prod_126",
    name: "fresa bandeja 250g",
    category: "Frutas",
    keywords: ["fresa", "frutilla"],
  },
  {
    id: "prod_127",
    name: "pina entera 1kg",
    category: "Frutas",
    keywords: ["pina", "anana", "ananas"],
  },
  {
    id: "prod_231",
    name: "mango 1kg",
    category: "Frutas",
    keywords: ["mango"],
  },
  {
    id: "prod_232",
    name: "parchita 1kg",
    category: "Frutas",
    keywords: ["parchita", "maracuya", "fruta de la pasion"],
  },
  {
    id: "prod_233",
    name: "uvas importadas 1kg",
    category: "Frutas",
    keywords: ["uvas", "uva"],
  },

  // ==========================================
  // 5. BEBIDAS Y LICORES
  // ==========================================
  {
    id: "prod_140",
    name: "agua mineral embotellada 500ml",
    category: "Bebidas",
    keywords: ["agua", "mineral", "botella", "botellita"],
  },
  {
    id: "prod_141",
    name: "agua mineral bidon 5l",
    category: "Bebidas",
    keywords: ["agua", "bidon", "garrafa", "botellon"],
  },
  {
    id: "prod_142",
    name: "refresco cola 1.5l",
    category: "Bebidas",
    keywords: ["refresco", "cola", "soda", "gaseosa", "pepsi", "coca cola"],
  },
  {
    id: "prod_143",
    name: "refresco cola 2l",
    category: "Bebidas",
    keywords: ["refresco", "cola", "soda", "gaseosa", "pepsi", "coca cola"],
  },
  {
    id: "prod_144",
    name: "refresco sabor naranja 2l",
    category: "Bebidas",
    keywords: ["refresco", "naranja", "gaseosa", "fanta"],
  },
  {
    id: "prod_145",
    name: "refresco sabor limon 2l",
    category: "Bebidas",
    keywords: ["refresco", "limon", "gaseosa", "sprite"],
  },
  {
    id: "prod_146",
    name: "jugo en polvo sabor durazno sobre",
    category: "Bebidas",
    keywords: ["jugo", "polvo", "durazno", "tang", "frutisco"],
  },
  {
    id: "prod_147",
    name: "jugo en polvo sabor naranja sobre",
    category: "Bebidas",
    keywords: ["jugo", "polvo", "naranja", "tang", "frutisco"],
  },
  {
    id: "prod_148",
    name: "nectar de durazno caja 1l",
    category: "Bebidas",
    keywords: ["nectar", "durazno", "jugo"],
  },
  {
    id: "prod_149",
    name: "malta en lata 355ml",
    category: "Bebidas",
    keywords: ["malta", "lata"],
  },
  {
    id: "prod_150",
    name: "malta botella 1.5l",
    category: "Bebidas",
    keywords: ["malta", "botella"],
  },
  {
    id: "prod_151",
    name: "cerveza en lata 355ml pack x6",
    category: "Licores",
    keywords: ["cerveza", "lata", "pack", "six pack"],
  },
  {
    id: "prod_152",
    name: "cerveza botellita 222ml",
    category: "Licores",
    keywords: ["cerveza", "botella", "botellita"],
  },
  {
    id: "prod_153",
    name: "ron anejo botella 750ml",
    category: "Licores",
    keywords: ["ron", "anejo", "licor"],
  },
  {
    id: "prod_154",
    name: "vino tinto botella 750ml",
    category: "Licores",
    keywords: ["vino", "tinto", "botella"],
  },
  {
    id: "prod_155",
    name: "vodka botella 750ml",
    category: "Licores",
    keywords: ["vodka", "licor"],
  },

  // ==========================================
  // 6. LIMPIEZA Y HOGAR
  // ==========================================
  {
    id: "prod_170",
    name: "detergente en polvo 1kg",
    category: "Limpieza",
    keywords: ["detergente", "polvo", "jabon", "lavar", "ropa"],
  },
  {
    id: "prod_171",
    name: "detergente liquido ropa 1l",
    category: "Limpieza",
    keywords: ["detergente", "liquido", "ropa"],
  },
  {
    id: "prod_172",
    name: "suavizante para ropa 1l",
    category: "Limpieza",
    keywords: ["suavizante", "ropa", "enjuague"],
  },
  {
    id: "prod_173",
    name: "jabon azul en panela para ropa 250g",
    category: "Limpieza",
    keywords: ["jabon", "azul", "panela", "barra", "lavar"],
  },
  {
    id: "prod_174",
    name: "lavaplatos en crema 500g",
    category: "Limpieza",
    keywords: ["lavaplatos", "crema", "bonanza", "platos"],
  },
  {
    id: "prod_175",
    name: "lavaplatos liquido 500ml",
    category: "Limpieza",
    keywords: ["lavaplatos", "liquido", "fregadero", "platos"],
  },
  {
    id: "prod_176",
    name: "cloro lejia liquido 1l",
    category: "Limpieza",
    keywords: ["cloro", "lejia", "blanqueador", "desinfectante"],
  },
  {
    id: "prod_177",
    name: "desinfectante multiuso pino 1l",
    category: "Limpieza",
    keywords: ["desinfectante", "pino", "multiuso"],
  },
  {
    id: "prod_178",
    name: "limpiador de pisos 1l",
    category: "Limpieza",
    keywords: ["limpiador", "pisos", "aroma"],
  },
  {
    id: "prod_179",
    name: "limpiador de vidrios spray 500ml",
    category: "Limpieza",
    keywords: ["limpiador", "vidrios", "cristales"],
  },
  {
    id: "prod_180",
    name: "papel higienico x4 rollos",
    category: "Limpieza",
    keywords: ["papel", "higienico", "toilette", "4"],
  },
  {
    id: "prod_181",
    name: "papel higienico x12 rollos",
    category: "Limpieza",
    keywords: ["papel", "higienico", "toilette", "12", "mega", "rinde"],
  },
  {
    id: "prod_182",
    name: "servilletas de papel paquete x100",
    category: "Limpieza",
    keywords: ["servilletas", "papel"],
  },
  {
    id: "prod_183",
    name: "toallin de cocina rollo",
    category: "Limpieza",
    keywords: ["toallin", "toallines", "cocina", "papel absorbente"],
  },
  {
    id: "prod_184",
    name: "esponja de platos doble uso x3",
    category: "Limpieza",
    keywords: ["esponja", "platos", "brillo"],
  },
  {
    id: "prod_185",
    name: "bolsas de basura medianas x10",
    category: "Limpieza",
    keywords: ["bolsas", "basura", "residuos", "medianas"],
  },
  {
    id: "prod_186",
    name: "bolsas de basura grandes x10",
    category: "Limpieza",
    keywords: ["bolsas", "basura", "residuos", "grandes"],
  },
  {
    id: "prod_187",
    name: "insecticida spray aerosol 360ml",
    category: "Limpieza",
    keywords: ["insecticida", "raid", "mosquitos", "cucarachas"],
  },
  {
    id: "prod_188",
    name: "fosforos cerillas caja x10",
    category: "Limpieza",
    keywords: ["fosforos", "cerillas"],
  },
  {
    id: "prod_189",
    name: "velas blancas parafina paquete x4",
    category: "Limpieza",
    keywords: ["velas", "parafina"],
  },

  // ==========================================
  // 7. CUIDADO PERSONAL E HIGIENE
  // ==========================================
  {
    id: "prod_200",
    name: "jabon de tocador antibacterial barra 90g",
    category: "Cuidado Personal",
    keywords: ["jabon", "tocador", "antibacterial", "protex", "barra"],
  },
  {
    id: "prod_201",
    name: "jabon liquido corporal 400ml",
    category: "Cuidado Personal",
    keywords: ["jabon", "liquido", "corporal", "ducha", "bano"],
  },
  {
    id: "prod_202",
    name: "shampoo para cabello 400ml",
    category: "Cuidado Personal",
    keywords: ["shampoo", "champu", "cabello", "pantene", "head"],
  },
  {
    id: "prod_203",
    name: "acondicionador para cabello 400ml",
    category: "Cuidado Personal",
    keywords: ["acondicionador", "cabello", "enjuague"],
  },
  {
    id: "prod_204",
    name: "crema dental anticaries 100g",
    category: "Cuidado Personal",
    keywords: ["crema dental", "pasta dental", "dentifrico", "colgate"],
  },
  {
    id: "prod_205",
    name: "cepillo de dientes cerdas medias x2",
    category: "Cuidado Personal",
    keywords: ["cepillo", "dientes", "dental"],
  },
  {
    id: "prod_206",
    name: "enjuague bucal 500ml",
    category: "Cuidado Personal",
    keywords: ["enjuague", "bucal", "colutorio"],
  },
  {
    id: "prod_207",
    name: "desodorante antitranspirante roll on 50ml",
    category: "Cuidado Personal",
    keywords: ["desodorante", "antitranspirante", "roll on"],
  },
  {
    id: "prod_208",
    name: "desodorante en aerosol 150ml",
    category: "Cuidado Personal",
    keywords: ["desodorante", "aerosol", "spray"],
  },
  {
    id: "prod_209",
    name: "panuelos faciales caja",
    category: "Cuidado Personal",
    keywords: ["panuelos", "faciales", "kleenex", "tissue"],
  },
  {
    id: "prod_210",
    name: "toallas sanitarias femeninas x10",
    category: "Cuidado Personal",
    keywords: ["toallas", "sanitarias", "femeninas", "compresas"],
  },
  {
    id: "prod_211",
    name: "protectores diarios femeninos x20",
    category: "Cuidado Personal",
    keywords: ["protectores", "diarios", "femeninos"],
  },
  {
    id: "prod_212",
    name: "maquinas de afeitar desechables x2",
    category: "Cuidado Personal",
    keywords: ["maquina", "afeitar", "gillette", "rastrillo", "cuchilla"],
  },
  {
    id: "prod_213",
    name: "crema de afeitar espuma 200ml",
    category: "Cuidado Personal",
    keywords: ["crema", "afeitar", "espuma"],
  },
  {
    id: "prod_214",
    name: "panales desechables etapa 3 x20",
    category: "Cuidado Personal",
    keywords: ["panales", "bebe", "etapa 3", "pampers", "huggies"],
  },
  {
    id: "prod_215",
    name: "panales desechables etapa 4 x20",
    category: "Cuidado Personal",
    keywords: ["panales", "bebe", "etapa 4", "pampers", "huggies"],
  },
  {
    id: "prod_216",
    name: "toallitas humedas para bebe paquete x50",
    category: "Cuidado Personal",
    keywords: ["toallitas", "humedas", "bebe"],
  },
  {
    id: "prod_217",
    name: "talco para bebe 200g",
    category: "Cuidado Personal",
    keywords: ["talco", "bebe", "polvo"],
  },
  {
    id: "prod_218",
    name: "crema corporal hidratante 400ml",
    category: "Cuidado Personal",
    keywords: ["crema", "corporal", "hidratante", "locion"],
  },
  {
    id: "prod_219",
    name: "bloqueador solar spf 50 120ml",
    category: "Cuidado Personal",
    keywords: ["bloqueador", "protector solar", "spf", "filtro solar"],
  },
  {
    id: "prod_220",
    name: "alcohol antiseptico 500ml",
    category: "Cuidado Personal",
    keywords: ["alcohol", "isopropilico", "etilico", "antiseptico"],
  },
];

// Comprobación al cargar: avisa en la consola si hay ids repetidos o nombres
// que no estén normalizados (ver reglas al inicio del archivo).
(function validateCatalog() {
  const ids = new Set();
  const names = new Set();
  initialCatalogData.forEach((product) => {
    if (ids.has(product.id)) console.warn("Catálogo: id repetido:", product.id);
    if (names.has(product.name))
      console.warn("Catálogo: nombre repetido:", product.name);
    ids.add(product.id);
    names.add(product.name);
    if (
      typeof normalizeProductName === "function" &&
      normalizeProductName(product.name) !== product.name
    ) {
      console.warn(
        `Catálogo: "${product.name}" no está normalizado (queda como "${normalizeProductName(product.name)}")`,
      );
    }
  });
})();
