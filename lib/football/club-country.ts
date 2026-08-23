/**
 * GENERERAD FIL — skriv inte i den för hand.
 * Byggd av scripts/import/build-club-country-map.ts (2026-08-23) ur
 * api-footballs /teams?id=, som svarar med klubbens land direkt.
 *
 * Innehåller varje klubb-id som förekommer i player_transfer_event,
 * player_career_stint eller vår egen team-tabell — 1967 klubbar med
 * verifierat land av 1967 uppslagna (0 saknade svar).
 * Vanligast: Sweden 192, England 121, Spain 108, Brazil 100, Italy 73, Norway 67, USA 62, Germany 61.
 *
 * Används av lib/football/incoming-transfers.ts för att avgöra om en
 * avsändarklubb är svensk eller utländsk — se den filens huvud för varför
 * karriärstatistiken inte räckte som källa.
 *
 * Kör om skriptet när nya klubbar dykt upp i transferdatan.
 */
export const CLUB_COUNTRY: Record<number, string> = {
  33: "England", // Manchester United
  34: "England", // Newcastle
  36: "England", // Fulham
  37: "England", // Huddersfield
  38: "England", // Watford
  39: "England", // Wolves
  40: "England", // Liverpool
  41: "England", // Southampton
  42: "England", // Arsenal
  43: "Wales", // Cardiff
  44: "England", // Burnley
  45: "England", // Everton
  46: "England", // Leicester
  47: "England", // Tottenham
  48: "England", // West Ham
  49: "England", // Chelsea
  50: "England", // Manchester City
  51: "England", // Brighton
  52: "England", // Crystal Palace
  54: "England", // Birmingham
  55: "England", // Brentford
  56: "England", // Bristol City
  57: "England", // Ipswich
  58: "England", // Millwall
  59: "England", // Preston
  60: "England", // West Brom
  61: "England", // Wigan
  62: "England", // Sheffield Utd
  63: "England", // Leeds
  64: "England", // Hull City
  65: "England", // Nottingham Forest
  66: "England", // Aston Villa
  67: "England", // Blackburn
  68: "England", // Bolton
  69: "England", // Derby
  70: "England", // Middlesbrough
  71: "England", // Norwich
  72: "England", // QPR
  73: "England", // Rotherham
  74: "England", // Sheffield Wednesday
  75: "England", // Stoke City
  76: "Wales", // Swansea
  77: "France", // Angers
  78: "France", // Bordeaux
  79: "France", // Lille
  80: "France", // Lyon
  81: "France", // Marseille
  83: "France", // Nantes
  84: "France", // Nice
  87: "France", // Amiens
  88: "France", // Caen
  89: "France", // Dijon
  90: "France", // Guingamp
  91: "France", // Monaco
  92: "France", // Nimes
  93: "France", // Reims
  94: "France", // Rennes
  95: "France", // Strasbourg
  96: "France", // Toulouse
  97: "France", // Lorient
  98: "France", // Ajaccio
  99: "France", // Clermont Foot
  100: "France", // Gazelec FC Ajaccio
  101: "France", // Grenoble
  102: "France", // Nancy
  103: "France", // Orleans
  104: "France", // RED Star FC 93
  105: "France", // Valenciennes
  106: "France", // Stade Brestois 29
  107: "France", // Chateauroux
  108: "France", // Auxerre
  109: "France", // Beziers
  110: "France", // Estac Troyes
  111: "France", // Le Havre
  112: "France", // Metz
  114: "France", // Paris FC
  115: "France", // Sochaux
  116: "France", // Lens
  120: "Brazil", // Botafogo
  122: "Brazil", // Parana
  123: "Brazil", // Sport Recife
  124: "Brazil", // Fluminense
  125: "Brazil", // America Mineiro
  127: "Brazil", // Flamengo
  129: "Brazil", // Ceara
  132: "Brazil", // Chapecoense-sc
  133: "Brazil", // Vasco DA Gama
  136: "Brazil", // Vitoria
  142: "Brazil", // Vila Nova
  144: "Brazil", // Atletico Goianiense
  145: "Brazil", // Avai
  146: "Brazil", // CRB
  147: "Brazil", // Coritiba
  148: "Brazil", // Londrina
  149: "Brazil", // Paysandu
  152: "Brazil", // Juventude
  153: "Brazil", // BOA
  154: "Brazil", // Fortaleza EC
  155: "Brazil", // Sampaio Correa
  157: "Germany", // Bayern München
  158: "Germany", // Fortuna Düsseldorf
  159: "Germany", // Hertha BSC
  160: "Germany", // SC Freiburg
  161: "Germany", // VfL Wolfsburg
  162: "Germany", // Werder Bremen
  163: "Germany", // Borussia Mönchengladbach
  164: "Germany", // FSV Mainz 05
  165: "Germany", // Borussia Dortmund
  166: "Germany", // Hannover 96
  167: "Germany", // 1899 Hoffenheim
  168: "Germany", // Bayer Leverkusen
  169: "Germany", // Eintracht Frankfurt
  170: "Germany", // FC Augsburg
  171: "Germany", // 1. FC Nürnberg
  172: "Germany", // VfB Stuttgart
  174: "Germany", // FC Schalke 04
  175: "Germany", // Hamburger SV
  176: "Germany", // VfL Bochum
  177: "Germany", // SSV Jahn Regensburg
  178: "Germany", // SpVgg Greuther Fürth
  179: "Germany", // 1. FC Magdeburg
  181: "Germany", // SV Darmstadt 98
  182: "Germany", // Union Berlin
  183: "Germany", // Dynamo Dresden
  184: "Germany", // FC Ingolstadt 04
  185: "Germany", // SC Paderborn 07
  186: "Germany", // FC St. Pauli
  187: "Germany", // MSV Duisburg
  188: "Germany", // Arminia Bielefeld
  189: "Germany", // SV Sandhausen
  190: "Germany", // Erzgebirge Aue
  191: "Germany", // Holstein Kiel
  192: "Germany", // 1. FC Köln
  193: "Netherlands", // PEC Zwolle
  194: "Netherlands", // Ajax
  195: "Netherlands", // Willem II
  196: "Netherlands", // Excelsior
  197: "Netherlands", // PSV Eindhoven
  198: "Netherlands", // ADO Den Haag
  199: "Netherlands", // De Graafschap
  200: "Netherlands", // Vitesse
  201: "Netherlands", // AZ Alkmaar
  202: "Netherlands", // Groningen
  203: "Netherlands", // NAC Breda
  204: "Netherlands", // VVV Venlo
  205: "Netherlands", // Fortuna Sittard
  206: "Netherlands", // Heracles
  207: "Netherlands", // Utrecht
  208: "Netherlands", // Emmen
  209: "Netherlands", // Feyenoord
  210: "Netherlands", // Heerenveen
  211: "Portugal", // Benfica
  212: "Portugal", // FC Porto
  213: "Portugal", // Feirense
  214: "Portugal", // Maritimo
  215: "Portugal", // Moreirense
  216: "Portugal", // Portimonense
  217: "Portugal", // SC Braga
  218: "Portugal", // Tondela
  221: "Portugal", // Belenenses
  225: "Portugal", // Nacional
  228: "Portugal", // Sporting CP
  230: "Portugal", // Estoril
  231: "Portugal", // Farense
  235: "Portugal", // Penafiel
  236: "Portugal", // SC Covilha
  237: "Portugal", // Varzim
  238: "Portugal", // Academico Viseu
  239: "Portugal", // Academica
  240: "Portugal", // Arouca
  242: "Portugal", // Famalicao
  244: "Portugal", // Leixoes
  245: "Portugal", // Mafra
  246: "Portugal", // SC Braga B
  247: "Scotland", // Celtic
  248: "Scotland", // Hamilton Academical
  249: "Scotland", // Hibernian
  250: "Scotland", // Kilmarnock
  252: "Scotland", // Aberdeen
  253: "Scotland", // Dundee
  254: "Scotland", // Heart Of Midlothian
  256: "Scotland", // Motherwell
  257: "Scotland", // Rangers
  258: "Scotland", // ST Johnstone
  259: "Belgium", // Lommel United
  260: "Belgium", // OH Leuven
  261: "Belgium", // KVC Westerlo
  262: "Belgium", // Tubize
  263: "Belgium", // Beerschot VA
  266: "Belgium", // KV Mechelen
  267: "Iceland", // Fylkir
  268: "Iceland", // IBV Vestmannaeyjar
  269: "Iceland", // Keflavik
  270: "Iceland", // FH hafnarfjordur
  271: "Iceland", // KR Reykjavik
  272: "Iceland", // KA Akureyri
  273: "Iceland", // Fjolnir
  274: "Iceland", // Valur Reykjavik
  275: "Iceland", // Stjarnan
  276: "Iceland", // Breidablik
  277: "Iceland", // Grindavik
  278: "Iceland", // Vikingur Reykjavik
  281: "Japan", // Kashiwa Reysol
  282: "Japan", // Sanfrecce Hiroshima
  283: "Japan", // Shimizu S-pulse
  284: "Japan", // Shonan Bellmare
  287: "Japan", // Urawa
  288: "Japan", // Nagoya Grampus
  293: "Japan", // Gamba Osaka
  295: "Japan", // Sagan Tosu
  302: "Japan", // Kyoto Sanga
  303: "Japan", // Machida Zelvia
  305: "Japan", // Mito Hollyhock
  310: "Japan", // Fagiano Okayama
  311: "Japan", // Albirex Niigata
  313: "Japan", // Omiya Ardija
  316: "Japan", // Avispa Fukuoka
  319: "Norway", // Brann
  320: "Norway", // Kristiansund BK
  321: "Norway", // Lillestrom
  322: "Norway", // Ranheim
  323: "Norway", // Stabaek
  324: "Norway", // Stromsgodset
  325: "Norway", // Tromso
  326: "Norway", // Valerenga
  327: "Norway", // Bodo/Glimt
  328: "Norway", // Haugesund
  329: "Norway", // Molde
  330: "Norway", // ODD Ballklubb
  331: "Norway", // Rosenborg
  332: "Norway", // Sandefjord
  333: "Norway", // Sarpsborg 08 FF
  334: "Norway", // Start
  335: "Poland", // Miedz Legnica
  336: "Poland", // Jagiellonia
  337: "Poland", // Slask Wroclaw
  338: "Poland", // Wisla Krakow
  339: "Poland", // Legia Warszawa
  340: "Poland", // Gornik Zabrze
  341: "Poland", // Wisla Plock
  343: "Poland", // Lechia Gdansk
  344: "Poland", // Arka Gdynia
  345: "Poland", // Zaglebie Lubin
  346: "Poland", // Korona Kielce
  347: "Poland", // Lech Poznan
  348: "Poland", // Pogon Szczecin
  350: "Poland", // Cracovia Krakow
  352: "Wales", // Bala Town
  353: "Wales", // Cardiff MET
  361: "Wales", // Barry Town
  363: "Sweden", // Hammarby FF
  364: "Sweden", // Djurgardens IF
  365: "Sweden", // Orebro SK
  366: "Sweden", // IFK Goteborg
  367: "Sweden", // BK Hacken
  368: "Sweden", // Dalkurd FF
  369: "Sweden", // Trelleborg
  370: "Sweden", // Sirius
  371: "Sweden", // IF Brommapojkarna
  372: "Sweden", // IF Elfsborg
  373: "Sweden", // GIF Sundsvall
  374: "Sweden", // Kalmar FF
  375: "Sweden", // Malmo FF
  376: "Sweden", // Ostersunds FK
  377: "Sweden", // AIK Stockholm
  378: "Sweden", // IFK Norrkoping
  380: "Belarus", // FC Minsk
  382: "Belarus", // FC Vitebsk
  385: "Belarus", // Torpedo Zhodino
  386: "Belarus", // Dinamo Brest
  387: "Belarus", // Neman
  388: "Belarus", // Bate Borisov
  391: "Belarus", // FC Isloch Minsk R.
  395: "Denmark", // Vejle
  396: "Denmark", // Sonderjyske
  397: "Denmark", // FC Midtjylland
  398: "Denmark", // FC Nordsjaelland
  399: "Denmark", // Vendsyssel FF
  400: "Denmark", // FC Copenhagen
  401: "Denmark", // Randers FC
  402: "Denmark", // Aalborg
  403: "Denmark", // Esbjerg
  404: "Denmark", // AC Horsens
  405: "Denmark", // Odense
  406: "Denmark", // Aarhus
  407: "Denmark", // Brondby
  408: "Denmark", // Hobro
  409: "Netherlands", // Dordrecht
  410: "Netherlands", // GO Ahead Eagles
  412: "Netherlands", // MVV
  413: "Netherlands", // NEC Nijmegen
  414: "Netherlands", // Roda
  415: "Netherlands", // Twente
  416: "Netherlands", // FC Volendam
  417: "Netherlands", // Waalwijk
  418: "Netherlands", // Jong AZ
  419: "Netherlands", // Almere City FC
  420: "Netherlands", // Cambuur
  421: "Netherlands", // Den Bosch
  422: "Netherlands", // FC Eindhoven
  423: "Netherlands", // FC OSS
  424: "Netherlands", // Helmond Sport
  426: "Netherlands", // Sparta Rotterdam
  427: "Netherlands", // Telstar
  430: "France", // Bourg-en-bresse 01
  442: "Argentina", // Defensa Y Justicia
  469: "Argentina", // Deportivo Moron
  478: "Argentina", // Instituto Cordoba
  481: "Argentina", // Villa Dalmine
  487: "Italy", // Lazio
  488: "Italy", // Sassuolo
  489: "Italy", // AC Milan
  490: "Italy", // Cagliari
  491: "Italy", // Chievo
  492: "Italy", // Napoli
  493: "Italy", // Spal
  494: "Italy", // Udinese
  495: "Italy", // Genoa
  496: "Italy", // Juventus
  497: "Italy", // AS Roma
  498: "Italy", // Sampdoria
  499: "Italy", // Atalanta
  500: "Italy", // Bologna
  501: "Italy", // Crotone
  502: "Italy", // Fiorentina
  503: "Italy", // Torino
  504: "Italy", // Hellas Verona
  507: "Italy", // Ascoli
  509: "Italy", // Cesena
  511: "Italy", // Empoli
  512: "Italy", // Frosinone
  513: "Italy", // Novara
  514: "Italy", // Salernitana
  515: "Italy", // Spezia
  517: "Italy", // Venezia
  518: "Italy", // Brescia
  520: "Italy", // Cremonese
  521: "Italy", // Foggia
  522: "Italy", // Palermo
  523: "Italy", // Parma
  524: "Italy", // Perugia
  525: "Italy", // Pescara
  529: "Spain", // Barcelona
  535: "Spain", // Malaga
  536: "Spain", // Sevilla
  537: "Spain", // Leganes
  538: "Spain", // Celta Vigo
  539: "Spain", // Levante
  540: "Spain", // Espanyol
  541: "Spain", // Real Madrid
  542: "Spain", // Alaves
  543: "Spain", // Real Betis
  546: "Spain", // Getafe
  547: "Spain", // Girona
  548: "Spain", // Real Sociedad
  549: "Turkey", // Beşiktaş
  551: "Switzerland", // FC Basel 1893
  552: "Slovenia", // Maribor
  553: "Greece", // Olympiakos Piraeus
  554: "Belgium", // Anderlecht
  555: "Russia", // CSKA Moscow
  556: "Azerbaijan", // Qarabag
  558: "Russia", // Spartak Moscow
  560: "Czech-Republic", // Slavia Praha
  561: "Croatia", // HNK Rijeka
  562: "Kazakhstan", // FC Astana
  563: "Israel", // Hapoel Beer Sheva
  564: "Turkey", // Başakşehir
  565: "Switzerland", // BSC Young Boys
  566: "Bulgaria", // Ludogorets
  567: "Czech-Republic", // Plzen
  568: "Moldova", // Sheriff Tiraspol
  569: "Belgium", // Club Brugge KV
  571: "Austria", // Red Bull Salzburg
  572: "Ukraine", // Dynamo Kyiv
  573: "Serbia", // FK Partizan
  574: "Macedonia", // Vardar Skopje
  575: "Greece", // AEK Athens FC
  576: "Hungary", // Budapest Honved
  579: "Montenegro", // Buducnost Podgorica
  582: "Armenia", // Alashkert
  584: "Ireland", // Dundalk
  586: "Lithuania", // FK Zalgiris Vilnius
  587: "Finland", // Mariehamn
  588: "Bosnia", // Zrinjski
  589: "Latvia", // Spartaks Jurmala
  596: "Russia", // Zenit
  598: "Serbia", // FK Crvena Zvezda
  599: "Ukraine", // Zorya Luhansk
  600: "Belgium", // Zulte Waregem
  601: "Austria", // Austria Vienna
  602: "Cyprus", // Apollon Limassol
  604: "Israel", // Maccabi Tel Aviv
  605: "Albania", // Skenderbeu Korce
  606: "Switzerland", // FC Lugano
  607: "Turkey", // Konyaspor
  608: "Croatia", // HNK Hajduk Split
  609: "Macedonia", // Shkendija
  610: "Hungary", // Fehérvár FC
  611: "Turkey", // Fenerbahçe
  614: "Cyprus", // AEK Larnaca
  615: "Slovenia", // NK Domzale
  616: "Croatia", // NK Osijek
  617: "Greece", // Panathinaikos
  618: "Austria", // SCR Altach
  619: "Greece", // PAOK
  620: "Croatia", // Dinamo Zagreb
  621: "Russia", // FC Krasnodar
  622: "Greece", // Panionios
  624: "Belgium", // Oostende
  625: "Denmark", // Lyngby
  627: "Azerbaijan", // Qabala
  628: "Czech-Republic", // Sparta Praha
  630: "Switzerland", // FC Sion
  631: "Belgium", // Gent
  632: "Romania", // Universitatea Craiova
  634: "Bulgaria", // Botev Plovdiv
  635: "Romania", // Dinamo Bucuresti
  636: "Romania", // FC Astra Giurgiu
  637: "Austria", // Sturm Graz
  639: "Ukraine", // Olimpik Donetsk
  640: "Czech-Republic", // Mlada Boleslav
  644: "Switzerland", // FC Luzern
  645: "Turkey", // Galatasaray
  646: "Bulgaria", // Levski Sofia
  648: "Azerbaijan", // Zira
  649: "Finland", // HJK Helsinki
  650: "Finland", // VPS
  651: "Hungary", // Ferencvarosi TC
  652: "Ireland", // Shamrock Rovers
  653: "Ireland", // Cork City
  654: "Bosnia", // Zeljeznicar Sarajevo
  656: "Slovakia", // Slovan Bratislava
  657: "Israel", // Beitar Jerusalem
  658: "Luxembourg", // Progres Niederkorn
  661: "Latvia", // FK Liepaja
  666: "Azerbaijan", // Şamaxı FK
  677: "Slovenia", // Olimpija Ljubljana
  678: "Faroe-Islands", // B36 Torshavn
  679: "Bosnia", // FK Sarajevo
  680: "Kosovo", // Prishtina
  682: "Faroe-Islands", // NSI Runavik
  685: "Georgia", // Torpedo Kutaisi
  687: "Estonia", // Flora Tallinn
  689: "Finland", // SJK
  691: "Moldova", // Milsami Orhei
  692: "Kazakhstan", // Ordabasy
  694: "Albania", // Tirana
  699: "Serbia", // Mladost Lucani
  701: "Faroe-Islands", // KI Klaksvik
  702: "Serbia", // Vojvodina
  705: "Georgia", // Dinamo Batumi
  708: "Albania", // Partizani
  709: "Armenia", // Pyunik Yerevan
  711: "Spain", // Alcorcon
  713: "Spain", // Cordoba
  714: "Spain", // Gimnastic
  715: "Spain", // Granada CF
  716: "Spain", // Lugo
  717: "Spain", // Numancia
  719: "Spain", // Tenerife
  720: "Spain", // Valladolid
  721: "Spain", // Lorca FC
  722: "Spain", // Albacete
  723: "Spain", // Almeria
  724: "Spain", // Cadiz
  725: "Spain", // Cultural Leonesa
  726: "Spain", // Huesca
  727: "Spain", // Osasuna
  728: "Spain", // Rayo Vallecano
  729: "Spain", // Reus
  731: "Spain", // Sporting Gijon
  733: "Belgium", // Standard Liege
  734: "Belgium", // Kortrijk
  735: "Belgium", // St. Truiden
  736: "Belgium", // Charleroi
  737: "Belgium", // Lokeren
  738: "Belgium", // SK Beveren
  740: "Belgium", // Antwerp
  742: "Belgium", // Genk
  743: "Belgium", // Royal Excel Mouscron
  744: "Germany", // Eintracht Braunschweig
  745: "Germany", // 1. FC Kaiserslautern
  746: "England", // Sunderland
  747: "England", // Barnsley
  748: "England", // Burton Albion
  751: "Belarus", // Slavia Mozyr
  752: "Brazil", // Luverdense
  754: "Brazil", // ABC
  755: "Brazil", // Nautico Recife
  757: "Norway", // Aalesund
  758: "Norway", // Sogndal
  759: "Norway", // Viking
  762: "Portugal", // GIL Vicente
  764: "Sweden", // Jonkopings Sodra
  765: "Sweden", // AFC Eskilstuna
  766: "Sweden", // Halmstad
  779: "Russia", // FC Rostov
  780: "Turkey", // Ankaraspor
  781: "Austria", // Rapid Vienna
  782: "Czech-Republic", // Slovan Liberec
  783: "Switzerland", // FC Zurich
  784: "Germany", // Würzburger Kickers
  785: "Germany", // Karlsruher SC
  786: "Germany", // TSV 1860 München
  794: "Brazil", // RB Bragantino
  795: "Brazil", // Joinville
  796: "Brazil", // Tupi
  797: "Spain", // Elche
  798: "Spain", // Mallorca
  801: "Italy", // Pisa
  806: "Netherlands", // Achilles 29
  807: "Portugal", // Olhanense
  809: "Portugal", // Fafe
  811: "Sweden", // Helsingborg
  812: "Sweden", // Falkenbergs FF
  813: "Sweden", // Gefle IF
  817: "Costa-Rica", // Limon FC
  822: "Costa-Rica", // LD Alajuelense
  824: "Costa-Rica", // Santos DE Guapiles
  827: "Iceland", // IA Akranes
  828: "Iceland", // Vikingur Olafsiik
  829: "Iceland", // Throttur Reykjavik
  830: "China", // Beijing Guoan
  831: "China", // Dalian Aerbin
  832: "China", // Guangzhou Evergrande FC
  834: "China", // Changchun Yatai
  835: "China", // Beijing Renhe
  836: "China", // SHANGHAI SIPG
  837: "China", // Tianjin Teda
  838: "China", // Guangzhou R&F
  839: "China", // Hebei Zhongji
  840: "China", // Henan Jianye
  841: "China", // Guizhou Zhicheng
  842: "China", // Jiangsu Suning
  847: "China", // Yanbian Tigers FC
  848: "China", // Hangzhou Greentown
  850: "Bulgaria", // Vitosha Bistritsa
  852: "Bulgaria", // Vereya Stara Zagora
  853: "Bulgaria", // CSKA Sofia
  854: "Bulgaria", // Slavia Sofia
  858: "Bulgaria", // Lokomotiv Plovdiv
  859: "Bulgaria", // Botev Vratsa
  860: "Spain", // Extremadura
  861: "Spain", // Rayo Majadahonda
  866: "Italy", // Gubbio
  867: "Italy", // Lecce
  868: "Italy", // Livorno
  872: "Italy", // Piacenza
  873: "Italy", // Virtus Francavilla
  875: "Italy", // Renate
  877: "Italy", // Triestina
  890: "Italy", // Paganese
  895: "Italy", // Como
  897: "Italy", // Ancona
  898: "Italy", // Messina
  899: "Italy", // Modena
  903: "Scotland", // Inverness CT
  905: "Algeria", // ES Setif
  907: "Algeria", // MC Oran
  910: "Algeria", // USM Alger
  914: "Algeria", // JS Saoura
  937: "Algeria", // RC Arba
  939: "Australia", // Western Sydney Wanderers
  940: "Australia", // Perth Glory
  941: "Australia", // Central Coast Mariners
  943: "Australia", // Sydney
  944: "Australia", // Melbourne Victory
  945: "Australia", // Melbourne City
  947: "Australia", // Brisbane Roar
  949: "Greece", // Panetolikos
  950: "Greece", // PAS Giannina
  951: "Greece", // Apollon Smirnis
  953: "Greece", // Larisa
  955: "Greece", // Asteras Tripolis
  956: "Greece", // Lamia
  957: "Greece", // Levadiakos
  959: "Greece", // Xanthi FC
  961: "Greece", // Veria
  964: "Morocco", // Difaa EL Jadida
  968: "Morocco", // Wydad AC
  974: "Morocco", // Ittihad Tanger
  980: "Tunisia", // ES Tunis
  983: "Tunisia", // CS Sfaxien
  989: "Tunisia", // ES Zarzis
  990: "Tunisia", // ES Sahel
  992: "Tunisia", // US Monastirienne
  994: "Turkey", // Göztepe
  995: "Turkey", // Akhisarspor
  996: "Turkey", // Alanyaspor
  997: "Turkey", // Gençlerbirliği S.K.
  998: "Turkey", // Trabzonspor
  999: "Turkey", // Yeni Malatyaspor
  1000: "Turkey", // Kardemir Karabukspor
  1001: "Turkey", // Kayserispor
  1002: "Turkey", // Sivasspor
  1003: "Turkey", // Bursaspor
  1004: "Turkey", // Kasımpaşa
  1005: "Turkey", // Antalyaspor
  1007: "Turkey", // Rizespor
  1008: "Turkey", // Gaziantepspor
  1009: "Turkey", // Erzurumspor FK
  1010: "Turkey", // Ankaragücü
  1011: "Switzerland", // FC ST. Gallen
  1013: "Switzerland", // Grasshoppers
  1014: "Switzerland", // Lausanne
  1015: "Switzerland", // Neuchatel Xamax FC
  1016: "Croatia", // Istra 1961
  1017: "Croatia", // NK Lokomotiva Zagreb
  1018: "Croatia", // NK Slaven Belupo
  1019: "Croatia", // Rudes
  1020: "Croatia", // Inter Zapresic
  1021: "Croatia", // HNK Cibalia
  1022: "Croatia", // RNK Split
  1024: "Austria", // SV Mattersburg
  1025: "Austria", // Wolfsberger AC
  1026: "Austria", // Lask Linz
  1027: "Austria", // SKN ST. Polten
  1028: "Austria", // Ried
  1031: "Egypt", // AL Masry
  1036: "Egypt", // Pyramids FC
  1038: "Egypt", // Misr EL Makasa
  1040: "Egypt", // Zamalek SC
  1044: "Egypt", // Smouha SC
  1046: "Egypt", // Wadi Degla
  1051: "Honduras", // CD Olimpia
  1055: "Honduras", // CD Motagua
  1058: "Honduras", // Real Espana
  1059: "Honduras", // Lobos Upnfm
  1063: "France", // Saint Etienne
  1068: "Croatia", // HNK Gorica
  1072: "Austria", // TSV Hartberg
  1076: "Russia", // Amkar
  1077: "Russia", // Arsenal Tula
  1078: "Russia", // FC UFA
  1079: "Russia", // Krylia Sovetov
  1080: "Russia", // FC Orenburg
  1081: "Russia", // TOM Tomsk
  1082: "Russia", // Anzhi
  1083: "Russia", // Rubin
  1084: "Russia", // Ural
  1085: "Russia", // Akhmat
  1086: "Russia", // FC Tosno
  1087: "Russia", // Ska-khabarovsk
  1088: "Russia", // Dynamo
  1120: "Slovakia", // Spartak Trnava
  1121: "Ukraine", // Vorskla Poltava
  1122: "Czech-Republic", // FK Jablonec
  1123: "Greece", // Aris Thessalonikis
  1124: "Greece", // OFI
  1154: "Ecuador", // Deportivo Cuenca
  1163: "Finland", // Ilves
  1164: "Finland", // Inter Turku
  1165: "Finland", // KuPS
  1166: "Finland", // Lahti
  1167: "Finland", // Rops
  1168: "Finland", // Turku PS
  1169: "Finland", // Honka
  1170: "Finland", // PS Kemi Kings
  1171: "Finland", // JJK
  1172: "Finland", // HIFK Helsinki
  1173: "Finland", // PK-35 Vantaa
  1196: "Brazil", // Uberlandia
  1198: "Brazil", // Remo
  1204: "Brazil", // Tubarao
  1211: "Brazil", // Brusque
  1223: "Brazil", // Operario-PR
  1224: "Brazil", // Juazeirense
  1237: "Netherlands", // Katwijk
  1244: "Netherlands", // DVS 33 Ermelo
  1249: "Netherlands", // Spakenburg
  1250: "Netherlands", // SVV Scheveningen
  1257: "Netherlands", // FC Lisse
  1270: "Netherlands", // Capelle
  1291: "France", // Chambly Thelle FC
  1295: "France", // Lyon Duchere
  1297: "France", // PAU
  1298: "France", // Le Mans
  1299: "France", // Boulogne
  1301: "France", // Rodez
  1305: "France", // Bastia
  1313: "Germany", // Preußen Münster
  1317: "Germany", // SG Sonnenhof Grossaspach
  1319: "Germany", // SV Wehen
  1320: "Germany", // Energie Cottbus
  1321: "Germany", // Hansa Rostock
  1324: "Germany", // VfL Osnabrück
  1327: "Germany", // VfR Aalen
  1329: "Germany", // FC Rot-Weiß Erfurt
  1332: "Germany", // FSV Frankfurt
  1334: "England", // Bristol Rovers
  1335: "England", // Charlton
  1336: "England", // Fleetwood Town
  1337: "England", // Northampton
  1338: "England", // Oxford United
  1343: "England", // Bradford
  1345: "England", // Chesterfield
  1346: "England", // Coventry
  1347: "England", // Gillingham
  1349: "England", // Oldham
  1350: "England", // Peterborough
  1352: "England", // Shrewsbury
  1353: "England", // Swindon Town
  1354: "England", // Doncaster
  1355: "England", // Portsmouth
  1356: "England", // Blackpool
  1357: "England", // Plymouth
  1358: "England", // Wycombe
  1359: "England", // Luton
  1360: "England", // Accrington ST
  1361: "England", // Colchester
  1363: "England", // Crewe
  1364: "England", // Exeter City
  1365: "England", // Grimsby
  1368: "England", // Stevenage
  1371: "England", // Carlisle
  1372: "England", // Cheltenham
  1373: "England", // Leyton Orient
  1375: "England", // Morecambe
  1376: "England", // Notts County
  1378: "England", // Forest Green
  1379: "England", // Lincoln
  1380: "England", // Macclesfield
  1381: "England", // Tranmere
  1382: "Scotland", // Dumbarton
  1383: "Scotland", // Morton
  1384: "Scotland", // Queen of the South
  1386: "Scotland", // Dundee Utd
  1393: "Belgium", // Union St. Gilloise
  1394: "Austria", // FC BW Linz
  1396: "Austria", // SC Wiener Neustadt
  1398: "Austria", // WSG Wattens
  1399: "Austria", // Austria Lustenau
  1401: "Austria", // SV Kapfenberg
  1403: "Austria", // Lask Juniors Linz
  1405: "Austria", // Austria Klagenfurt
  1406: "Austria", // SK Vorwarts Steyr
  1413: "Bulgaria", // Tsarsko Selo
  1414: "Bulgaria", // Botev Galabovo
  1424: "Bulgaria", // Montana
  1426: "Bulgaria", // CSKA 1948
  1430: "Bulgaria", // Arda Kardzhali
  1432: "China", // Shanghai Shenxin
  1433: "China", // Shenzhen Ruby FC
  1434: "China", // Wuhan Zall
  1436: "China", // Beijing Baxy
  1437: "China", // Dalian Transcendence
  1439: "China", // Meizhou Kejia
  1440: "China", // Nei Mongol Zhongyou
  1441: "China", // Qingdao Huanghai
  1443: "China", // Baoding Yingli Yitong
  1471: "Croatia", // Dugopolje
  1472: "Croatia", // Hrvatski Dragovoljac
  1475: "Croatia", // Sibenik
  1478: "Croatia", // Novigrad
  1479: "Croatia", // Sesvete
  1483: "Croatia", // NK Varazdin
  1487: "Croatia", // Bsk Bijelo Brdo
  1576: "Egypt", // Haras El Hodood
  1577: "Egypt", // Al Ahly
  1579: "Italy", // Monza
  1581: "Italy", // Carrarese
  1583: "Italy", // Robur Siena
  1595: "USA", // Seattle Sounders
  1596: "USA", // San Jose Earthquakes
  1597: "USA", // FC Dallas
  1598: "USA", // Orlando City SC
  1599: "USA", // Philadelphia Union
  1600: "USA", // Houston Dynamo
  1601: "Canada", // Toronto FC
  1602: "USA", // New York Red Bulls
  1603: "Canada", // Vancouver Whitecaps
  1604: "USA", // New York City FC
  1605: "USA", // Los Angeles Galaxy
  1606: "USA", // Real Salt Lake
  1607: "USA", // Chicago Fire
  1608: "USA", // Atlanta United FC
  1609: "USA", // New England Revolution
  1610: "USA", // Colorado Rapids
  1611: "USA", // Sporting Kansas City
  1612: "USA", // Minnesota United FC
  1613: "USA", // Columbus Crew
  1615: "USA", // DC United
  1616: "USA", // Los Angeles FC
  1617: "USA", // Portland Timbers
  1622: "Germany", // SV Babelsberg 03
  1626: "Germany", // FC Astoria Walldorf
  1634: "Germany", // FC 08 Homburg
  1649: "Germany", // Weiche Flensburg
  1652: "Germany", // SSV Ulm 1846
  1692: "Italy", // Reggina
  1704: "Italy", // Mestre
  1705: "Italy", // Ravenna
  1707: "Italy", // Virtus Verona
  1708: "Italy", // Vis Pesaro
  1712: "Italy", // Cavese
  1714: "Italy", // Gozzano
  1715: "Italy", // Juventus U23
  1818: "England", // Aldershot Town
  1819: "England", // Barrow
  1820: "England", // Chester
  1821: "England", // Dagenham & Redbridge
  1823: "England", // Gateshead
  1824: "England", // Guiseley AFC
  1825: "England", // Maidstone Utd
  1826: "England", // Southport
  1827: "England", // Torquay
  1830: "England", // Boreham Wood
  1832: "England", // Bromley
  1836: "England", // Woking
  1839: "England", // AFC Fylde
  1945: "Argentina", // Defensores Unidos
  1993: "Russia", // Fakel
  1994: "Russia", // Khimki
  2002: "Russia", // Spartak Nalchik
  2004: "Russia", // Volgar Astrakhan
  2006: "Russia", // Baltika
  2011: "Russia", // Nizhny Novgorod
  2012: "Russia", // FC Sochi
  2015: "Russia", // Krasnodar 2
  2029: "Luxembourg", // Jeunesse Canach
  2035: "Luxembourg", // UN Kaerjeng 97
  2039: "Luxembourg", // Rodange 91
  2040: "Luxembourg", // US Hostert
  2047: "Costa-Rica", // Sporting San Jose
  2060: "Denmark", // AB Copenhagen
  2061: "Denmark", // FC Fredericia
  2062: "Denmark", // FC Helsingor
  2063: "Denmark", // HB Koge
  2064: "Denmark", // Nykobing FC
  2065: "Denmark", // Fremad Amager
  2066: "Denmark", // Naestved
  2067: "Denmark", // Roskilde
  2068: "Denmark", // Skive
  2070: "Denmark", // Viborg
  2072: "Denmark", // Hvidovre
  2073: "Denmark", // Silkeborg
  2075: "Finland", // FF Jaro
  2076: "Finland", // Kooteepee
  2077: "Finland", // AC Oulu
  2078: "Finland", // EIF
  2080: "Finland", // Haka
  2081: "Finland", // KPV Kokkola
  2082: "Finland", // Gnistan
  2085: "Finland", // Klubi-04
  2090: "Greece", // Panthrakikos
  2091: "Greece", // Trikala
  2095: "Greece", // Kallithea
  2096: "Greece", // Kissamikos
  2097: "Greece", // Panegialios
  2101: "Greece", // Apollon Larissa FC
  2104: "Greece", // Doxa Dramas
  2106: "Greece", // Panachaiki FC
  2109: "Greece", // Iraklis
  2110: "Greece", // Volos NFC
  2112: "Iceland", // Fjardabyggd
  2113: "Iceland", // HK Kopavogur
  2115: "Iceland", // Selfoss
  2116: "Iceland", // Thor Akureyri
  2117: "Iceland", // Fram Reykjavik
  2118: "Iceland", // Haukar
  2121: "Iceland", // Grotta
  2123: "Iceland", // Njardvik
  2142: "Norway", // Bryne
  2143: "Norway", // KFUM Oslo
  2144: "Norway", // Kongsvinger
  2145: "Norway", // Levanger
  2146: "Norway", // Sandnes ULF
  2147: "Norway", // Strommen
  2148: "Norway", // Asane
  2149: "Norway", // Fredrikstad
  2150: "Norway", // hodd
  2151: "Norway", // jerv
  2152: "Norway", // Mjondalen
  2153: "Norway", // Raufoss
  2154: "Norway", // Ull/Kisa
  2155: "Norway", // Arendal
  2156: "Norway", // Elverum
  2158: "Norway", // Tromsdalen Uil
  2159: "Norway", // Ham-Kam
  2160: "Norway", // Nest-Sotra
  2161: "Norway", // Notodden
  2162: "Sweden", // Atvidabergs FF
  2163: "Sweden", // IFK Varnamo
  2164: "Sweden", // IK Frej
  2165: "Sweden", // Ljungskile SK
  2166: "Sweden", // Orgryte IS
  2167: "Sweden", // Syrianska FC
  2168: "Sweden", // Angelholms FF
  2169: "Sweden", // Assyriska FF
  2170: "Sweden", // Gais
  2171: "Sweden", // Varbergs BoIS FC
  2172: "Sweden", // Degerfors IF
  2173: "Sweden", // Norrby IF
  2174: "Sweden", // Osters IF
  2175: "Sweden", // IK brage
  2176: "Sweden", // Landskrona BoIS
  2177: "Switzerland", // FC Aarau
  2180: "Switzerland", // FC Winterthur
  2181: "Switzerland", // FC Chiasso
  2182: "Switzerland", // FC Schaffhausen
  2186: "Switzerland", // SC Kriens
  2191: "Wales", // Penybont
  2204: "Brazil", // AO Itabaiana
  2208: "Brazil", // Brasiliense
  2212: "Brazil", // Foz Do Iguacu
  2220: "Brazil", // Rio Branco
  2221: "Brazil", // River AC
  2224: "Brazil", // Sergipe
  2227: "Brazil", // Tombense
  2229: "Brazil", // Uniclinic Atletico Clube
  2230: "Brazil", // Votuporanguense
  2232: "Brazil", // Sao Jose
  2239: "Norway", // Skeid
  2240: "Sweden", // Mjallby AIF
  2241: "Sweden", // Vasteras SK FK
  2242: "USA", // FC Cincinnati
  2243: "Finland", // MyPa
  2246: "Romania", // CFR 1907 Cluj
  2247: "Cyprus", // Apoel Nicosia
  2250: "Czech-Republic", // Sigma Olomouc
  2251: "Serbia", // FK Spartak Zdrepceva KRV
  2252: "Ukraine", // FC Mariupol
  2253: "Israel", // Hapoel Haifa
  2254: "Serbia", // Radnicki NIS
  2255: "Hungary", // Ujpest
  2257: "Slovakia", // Dunajska Streda
  2262: "Georgia", // Dinamo Tbilisi
  2264: "Malta", // Gzira United
  2265: "Macedonia", // Shkupi 1927
  2269: "Cyprus", // Anorthosis
  2273: "Estonia", // FC Levadia Tallinn
  2274: "Estonia", // Trans Narva
  2280: "Mexico", // Club Tijuana
  2283: "Mexico", // Atlas
  2287: "Mexico", // Club America
  2294: "Mexico", // Veracruz
  2295: "Mexico", // Cruz Azul
  2297: "Mexico", // Dorados
  2303: "Mexico", // Zacatepec 1948
  2308: "Mexico", // Celaya
  2326: "Chile", // Union La Calera
  2336: "Chile", // Magallanes
  2341: "Chile", // D. La Serena
  2347: "Uruguay", // SUD America
  2351: "Uruguay", // CA River Plate
  2356: "Uruguay", // Club Nacional
  2361: "Uruguay", // Boston River
  2374: "Uruguay", // Tacuarembo
  2389: "Hungary", // Mezokovesd-zsory
  2391: "Hungary", // Puskas Academy
  2392: "Hungary", // Debreceni VSC
  2393: "Hungary", // Diosgyori VTK
  2394: "Hungary", // Kisvarda FC
  2396: "Hungary", // MTK Budapest
  2402: "Hungary", // Gyori ETO FC
  2405: "Hungary", // VAC
  2406: "Hungary", // Bekescsaba 1912
  2437: "Canada", // FC Edmonton
  2441: "Indonesia", // PSM Makassar
  2444: "Indonesia", // Persepam Madura Utd
  2446: "Indonesia", // Persebaya Surabaya
  2448: "Indonesia", // Bali United
  2456: "Indonesia", // Semen Padang
  2467: "Kenya", // GOR Mahia
  2475: "Kenya", // Tusker
  2504: "Malaysia", // Penang
  2505: "Malaysia", // Sabah FA
  2523: "Malaysia", // Johor Darul Takzim FC
  2524: "Malaysia", // Perak
  2526: "Malaysia", // Selangor
  2527: "Malaysia", // Kedah
  2534: "New-Zealand", // Team Wellington
  2535: "New-Zealand", // Wellington Phoenix II
  2537: "New-Zealand", // Auckland City
  2538: "New-Zealand", // Canterbury United
  2546: "Peru", // Sporting Cristal
  2549: "Peru", // U. San Martin
  2553: "Peru", // Alianza Lima
  2578: "Romania", // FC Voluntari
  2579: "Romania", // AFC Hermannstadt
  2583: "Romania", // Politehnica Iasi
  2585: "Romania", // Sepsi OSK Sfantu Gheorghe
  2589: "Romania", // Uta Arad
  2596: "Romania", // Farul Constanta
  2598: "Romania", // Petrolul Ploiesti
  2603: "Romania", // FC Clinceni
  2621: "Canada", // HFX Wanderers FC
  2622: "Canada", // Pacific FC
  2623: "Canada", // York United
  2625: "China", // Shaanxi Changan Athletic
  2632: "Serbia", // Jagodina
  2633: "Serbia", // OFK Beograd
  2634: "Serbia", // Sindjelic Beograd
  2636: "Serbia", // Kolubara
  2639: "Serbia", // Proleter Novi SAD
  2641: "Serbia", // Sloboda Uzice
  2643: "Serbia", // Novi Pazar
  2645: "Serbia", // Teleoptik
  2647: "Serbia", // Metalac GM
  2649: "Serbia", // Borac Cacak
  2653: "Serbia", // Javor
  2654: "Serbia", // Zarkovo
  2655: "Serbia", // Napredak
  2656: "Serbia", // Cukaricki
  2657: "Serbia", // Radnik Surdulica
  2658: "Serbia", // FK Vozdovac
  2659: "Serbia", // Backa
  2660: "Serbia", // RAD
  2662: "South-Africa", // Cape Town ALL Stars
  2664: "South-Africa", // Jomo Cosmos
  2669: "South-Africa", // Amazulu
  2682: "South-Africa", // Marumo Gallants
  2683: "South-Africa", // Ajax Cape Town
  2689: "South-Africa", // Free State Stars
  2690: "South-Africa", // Golden Arrows
  2691: "South-Africa", // Kaizer Chiefs
  2694: "South-Africa", // Supersport United
  2695: "South-Africa", // Bidvest Wits
  2697: "South-Africa", // Cape Town City
  2698: "South-Africa", // Chippa United
  2699: "South-Africa", // Mamelodi Sundowns
  2714: "Iran", // Gol Gohar
  2719: "Iran", // Nassaji Mazandaran
  2733: "Iran", // Esteghlal FC
  2734: "Iran", // Foolad FC
  2737: "Iran", // Tractor Sazi
  2742: "Iran", // Persepolis FC
  2743: "Iran", // Sanat Naft
  2745: "South-Korea", // Bucheon FC 1995
  2746: "South-Korea", // Gangwon FC
  2748: "South-Korea", // FC Anyang
  2749: "South-Korea", // Seoul E-Land FC
  2750: "South-Korea", // Daejeon Citizen
  2751: "South-Korea", // Gyeongnam FC
  2753: "South-Korea", // Asan Mugunghwa
  2756: "South-Korea", // Suwon City FC
  2758: "South-Korea", // Ansan Greeners
  2759: "South-Korea", // Gwangju FC
  2760: "South-Korea", // Jeonnam Dragons
  2761: "South-Korea", // Jeju United FC
  2762: "South-Korea", // Jeonbuk Motors
  2763: "South-Korea", // Incheon United
  2764: "South-Korea", // Pohang Steelers
  2765: "South-Korea", // Suwon Bluewings
  2766: "South-Korea", // FC Seoul
  2767: "South-Korea", // Ulsan Hyundai FC
  2768: "South-Korea", // Gimcheon Sangmu FC
  2769: "Thailand", // BG Pathum United
  2770: "Thailand", // Bangkok United
  2772: "Thailand", // Chonburi FC
  2773: "Thailand", // Nakhon Ratchasima FC
  2775: "Thailand", // Police Tero
  2776: "Thailand", // Ratchaburi
  2779: "Thailand", // Army United
  2780: "Thailand", // Buriram United
  2782: "Thailand", // Pattaya United
  2785: "Thailand", // Suphanburi
  2786: "Thailand", // Muangthong United
  2789: "Thailand", // Port FC
  2791: "Thailand", // Prachuap
  2796: "Thailand", // Nong Bua Pitchaya
  2827: "Venezuela", // Puerto Cabello
  2865: "United-Arab-Emirates", // Al Ain
  2867: "United-Arab-Emirates", // Dibba Al-Fujairah
  2869: "United-Arab-Emirates", // Hatta SC
  2871: "United-Arab-Emirates", // Al-Jazira
  2873: "United-Arab-Emirates", // Al-Dhafra
  2874: "United-Arab-Emirates", // Sharjah FC
  2876: "United-Arab-Emirates", // Al-Ittihad Kalba
  2877: "United-Arab-Emirates", // Baniyas SC
  2879: "United-Arab-Emirates", // Ajman
  2893: "Qatar", // Al Shahaniya
  2896: "Qatar", // Al Ahli Doha
  2897: "Qatar", // Al-Rayyan SC
  2898: "Qatar", // Al-Sailiya
  2899: "Qatar", // UMM Salal
  2900: "Qatar", // Al Wakrah
  2901: "Qatar", // Al-Khor
  2902: "Qatar", // Muaither SC
  2904: "Qatar", // Al-Duhail SC
  2905: "Qatar", // Al-Arabi SC
  2907: "Qatar", // Qatar SC
  2908: "Qatar", // Al-Markhiya
  2915: "Qatar", // Al Mesaimeer
  2916: "Qatar", // Al Shamal
  2925: "Qatar", // Al Bidda SC
  2927: "Saudi-Arabia", // Najran
  2929: "Saudi-Arabia", // Al-Ahli Jeddah
  2930: "Saudi-Arabia", // Al-Faisaly FC
  2931: "Saudi-Arabia", // Al-Fateh
  2934: "Saudi-Arabia", // Al-Ettifaq
  2936: "Saudi-Arabia", // Al Taawon
  2937: "Saudi-Arabia", // Al Wehda Club
  2940: "Saudi-Arabia", // Al Shabab
  2942: "Saudi-Arabia", // Al Taee
  2944: "Saudi-Arabia", // Al-Fayha
  2945: "Saudi-Arabia", // Al-Hazm
  2950: "Saudi-Arabia", // Al-Adalah
  2951: "Saudi-Arabia", // Abha
  2956: "Saudi-Arabia", // Damac
  2959: "Saudi-Arabia", // Al Qaisoma
  2966: "Saudi-Arabia", // Al Bukayriyah
  2977: "Saudi-Arabia", // Al Okhdood
  2994: "Chile", // U. Catolica
  3027: "France", // Bobigny
  3069: "France", // Le Puy Foot
  3108: "France", // Saint-Malo
  3144: "France", // Amnéville
  3145: "France", // Ancienne Château-Gontier
  3151: "France", // Avoine OCC
  3200: "France", // Martigues
  3235: "France", // Tarbes
  3317: "Albania", // Flamurtari
  3319: "Albania", // Kastrioti Krujë
  3326: "Albania", // Dinamo Tirana
  3329: "Albania", // Erzeni Shijak
  3336: "Albania", // Tomori Berat
  3339: "Albania", // Vllaznia Shkodër
  3344: "Andorra", // Ordino
  3357: "Bosnia", // Krupa na Vrbasu
  3358: "Bosnia", // Mladost Doboj Kakanj
  3359: "Bosnia", // Radnik Bijeljina
  3360: "Bosnia", // Sloboda Tuzla
  3361: "Bosnia", // Tuzla City
  3364: "Bosnia", // Borac Banja Luka
  3391: "Belarus", // Ruh Brest
  3394: "Belarus", // Sputnik
  3396: "Cyprus", // AEL
  3398: "Cyprus", // Doxa
  3399: "Cyprus", // Enosis
  3400: "Cyprus", // Ermis
  3401: "Cyprus", // Nea Salamis
  3402: "Cyprus", // Omonia Nicosia
  3403: "Cyprus", // Pafos
  3406: "Cyprus", // Akritas
  3408: "Cyprus", // Aris
  3412: "Cyprus", // Ethnikos Achna
  3413: "Cyprus", // Karmiotissa
  3415: "Cyprus", // Olympiakos
  3416: "Cyprus", // Omonia Aradippou
  3424: "Cyprus", // Krasava Ypsonas
  3438: "Jamaica", // Dunbeholden
  3443: "Jamaica", // Portmore United
  3462: "India", // Churchill Brothers
  3464: "India", // Gokulam
  3469: "India", // Real Kashmir
  3475: "India", // Goa
  3479: "India", // NorthEast United
  3484: "Poland", // GKS Katowice
  3487: "Poland", // Nieciecza
  3489: "Poland", // Podbeskidzie
  3491: "Poland", // Raków Częstochowa
  3492: "Poland", // Sandecja Nowy Sącz
  3493: "Poland", // Stal Mielec
  3495: "Poland", // Tychy 71
  3496: "Poland", // Warta Poznań
  3497: "Poland", // Wigry Suwałki
  3498: "Poland", // ŁKS Łódź
  3499: "Georgia", // Dila
  3502: "Georgia", // FC Iberia 1999
  3505: "Georgia", // Gagra
  3507: "Georgia", // Kolkheti Poti
  3514: "Iceland", // Afturelding
  3528: "Estonia", // Paide
  3529: "Estonia", // Tallinna Kalev
  3533: "Kuwait", // Al Fahaheel
  3536: "Kuwait", // Al Nasar
  3539: "Kuwait", // Al Tadhamon
  3545: "Kuwait", // Khaitan
  3550: "Slovakia", // Senica
  3552: "Slovakia", // Zemplín Michalovce
  3563: "Turkey", // Adana Demirspor
  3564: "Turkey", // Adanaspor
  3565: "Turkey", // Afjet Afyonspor
  3566: "Turkey", // Altay
  3568: "Turkey", // Balıkesirspor
  3569: "Turkey", // Boluspor
  3570: "Turkey", // Denizlispor
  3571: "Turkey", // Elazığspor
  3572: "Turkey", // Eskişehirspor
  3573: "Turkey", // Gaziantep FK
  3574: "Turkey", // Giresunspor
  3575: "Turkey", // Hatayspor
  3578: "Turkey", // İstanbulspor
  3579: "Turkey", // Amed
  3587: "Turkey", // Etimesgut SK
  3588: "Turkey", // Eyüpspor
  3589: "Turkey", // Fatih Karagümrük
  3595: "Turkey", // Keçiörengücü
  3602: "Turkey", // Sakaryaspor
  3603: "Turkey", // Samsunspor
  3607: "Turkey", // Tarsus İdman Yurdu
  3609: "Turkey", // Beykoz Anadolu
  3613: "Turkey", // Şanlıurfaspor
  3615: "Ukraine", // Chornomorets
  3617: "Ukraine", // Karpaty
  3623: "Ukraine", // Dnipro-1
  3627: "Ukraine", // Kolos Kovalivka
  3653: "Guatemala", // Suchitepéquez
  3672: "Vietnam", // Ho Chi Minh
  3674: "Vietnam", // Nam Dinh
  3680: "Vietnam", // Thanh Hóa
  3682: "Armenia", // Ararat
  3683: "Armenia", // Ararat-Armenia
  3684: "Armenia", // FC Noah
  3695: "Uzbekistan", // Lokomotiv
  3700: "Bolivia", // Always Ready
  3702: "Bolivia", // Bolívar
  3713: "Czech-Republic", // Baník Ostrava
  3716: "Czech-Republic", // Karviná
  3718: "Czech-Republic", // Příbram
  3719: "Czech-Republic", // Slovácko
  3720: "Czech-Republic", // Teplice
  3724: "Czech-Republic", // Pardubice
  3730: "Czech-Republic", // Vlašim
  3733: "Czech-Republic", // Zbrojovka Brno
  3735: "Czech-Republic", // Ústí nad Labem
  3736: "Czech-Republic", // České Budějovice
  3797: "Australia", // Altona Magic
  3807: "Australia", // Melbourne Knights
  3830: "Canada", // Forge
  3831: "Canada", // Valour
  3840: "Ireland", // Bohemians
  3842: "Ireland", // Sligo Rovers
  3843: "Ireland", // St Patrick's Athl.
  3845: "Ireland", // Waterford
  3846: "Ireland", // Athlone Town
  3854: "Ireland", // Shelbourne
  3860: "Lithuania", // Džiugas Telšiai
  3861: "Lithuania", // Hegelmann Litauen
  3870: "Lithuania", // Šiauliai
  3872: "Lithuania", // Kauno Žalgiris
  3874: "Lithuania", // Panevėžys
  3882: "Indonesia", // PSS Sleman
  3883: "Estonia", // FCI Tallinn
  3985: "Russia", // Torpedo Moskva
  3987: "USA", // Austin Bold
  3988: "USA", // Philadelphia Union II
  3989: "USA", // Birmingham Legion
  3990: "USA", // Charleston Battery
  3992: "USA", // Colorado Springs
  3993: "USA", // El Paso Locomotive
  3994: "USA", // Fresno FC
  3996: "USA", // Indy Eleven
  3997: "USA", // Ventura County
  3998: "USA", // Las Vegas Lights
  4002: "USA", // Nashville
  4005: "USA", // North Carolina
  4006: "USA", // OKC Energy
  4007: "USA", // Orange County SC
  4009: "USA", // Phoenix Rising
  4012: "USA", // Real Monarchs
  4014: "USA", // Rio Grande Valley
  4017: "USA", // San Antonio
  4021: "USA", // Tampa Bay Rowdies
  4023: "USA", // Penn
  4024: "USA", // Richmond Kickers
  4025: "Canada", // Toronto II
  4043: "USA", // Corpus Christi
  4133: "Faroe-Islands", // HB Torshavn
  4134: "Slovakia", // Pohronie
  4135: "Latvia", // Auda
  4159: "Latvia", // Metta / LU
  4165: "Iceland", // Vestri
  4174: "Faroe-Islands", // 07 Vestur
  4191: "Faroe-Islands", // Skála
  4192: "Faroe-Islands", // TB
  4194: "Macedonia", // Akademija Pandev
  4195: "Israel", // Maccabi Haifa
  4199: "Azerbaijan", // Səbail
  4202: "Brunei", // DPMM FC Brunei
  4207: "Hong-Kong", // Warriors
  4211: "Uzbekistan", // Buxoro
  4223: "Uzbekistan", // Sogdiana
  4224: "Uzbekistan", // Dinamo Samarqand
  4225: "Uzbekistan", // Surkhon
  4229: "Indonesia", // Cilegon United
  4248: "Poland", // Radomiak Radom
  4257: "Czech-Republic", // Artis
  4268: "Germany", // Waldhof Mannheim
  4269: "Switzerland", // Stade Lausanne-Ouchy
  4288: "Bosnia", // Vitez
  4293: "Bosnia", // Orašje
  4297: "Bosnia", // Travnik
  4324: "Japan", // Sagamihara
  4329: "Macedonia", // Pobeda
  4346: "Macedonia", // Struga
  4347: "Macedonia", // Teteks
  4358: "Slovenia", // Aluminij
  4359: "Slovenia", // Bravo
  4360: "Slovenia", // Celje
  4361: "Slovenia", // Rudar
  4362: "Slovenia", // Tabor Sežana
  4373: "Slovenia", // Fužinar
  4374: "Slovenia", // Koper
  4377: "Slovenia", // NŠ Drava
  4418: "Guinea", // Kaloum Star
  4450: "Ghana", // Dreams
  4487: "Israel", // Hapoel Nazareth Illit
  4488: "Israel", // Hapoel Petah Tikva
  4489: "Israel", // Hapoel Ramat Gan
  4490: "Israel", // Hapoel Ramat HaSharon
  4494: "Israel", // Maccabi Ahi Nazareth
  4497: "Israel", // Hapoel Kfar Saba
  4499: "Israel", // Sektzia Nes Tziona
  4500: "Israel", // Hapoel Hadera
  4501: "Israel", // Hapoel Tel Aviv
  4503: "Israel", // Maccabi Herzliya
  4505: "Israel", // Maccabi Netanya
  4508: "Israel", // Bnei Yehuda
  4509: "Israel", // Hapoel Ra'anana
  4512: "Ivory-Coast", // ASEC Mimosas
  4519: "Ivory-Coast", // Racing d'Abidjan
  4525: "Ivory-Coast", // Stade d'Abidjan
  4531: "Jordan", // Al Faisaly
  4537: "Jordan", // Al Wihdat
  4552: "Kazakhstan", // Kaspiy
  4558: "Kazakhstan", // Okzhetpes
  4560: "Kazakhstan", // Zhetysu
  4563: "Kazakhstan", // Aktobe
  4564: "Kazakhstan", // Atyrau
  4565: "Kazakhstan", // Irtysh
  4569: "Lebanon", // Al Ansar
  4570: "Lebanon", // Al Nejmeh
  4573: "Lebanon", // Safa
  4626: "Malta", // Hamrun Spartans
  4627: "Malta", // Mosta
  4628: "Malta", // Sliema Wanderers
  4633: "Moldova", // Zimbru
  4653: "Belgium", // Mons
  4654: "Belgium", // Beerschot
  4659: "Bulgaria", // Hebar 1918
  4660: "Bulgaria", // Spartak Varna
  4662: "Portugal", // União de Leiria
  4665: "Spain", // Racing Santander
  4666: "Spain", // Hércules
  4674: "Germany", // Bayern München II
  4676: "Denmark", // Kolding IF
  4680: "England", // Hampton & Richmond
  4686: "England", // Stockport County
  4687: "England", // Weston-super-Mare
  4690: "England", // Dartford
  4692: "England", // Hereford
  4695: "England", // Kidderminster Harriers
  4701: "England", // Brackley Town
  4704: "England", // Eastbourne Borough
  4708: "England", // St Albans City
  4715: "Belgium", // Excelsior Virton
  4716: "Portugal", // Casa Pia
  4717: "Portugal", // Vilafranquense
  4726: "Portugal", // Amora
  4727: "Portugal", // Anadia
  4796: "Portugal", // Sintrense
  4799: "Portugal", // Torreense
  4814: "Portugal", // Vilaverdense
  4839: "Portugal", // Estrela Vendas Novas
  4848: "Portugal", // Mondinense
  4857: "Brazil", // Resende
  4872: "Portugal", // Atlético CP
  4905: "South-Africa", // Stellenbosch
  4906: "Spain", // Fuenlabrada
  4922: "Angola", // Petro de Luanda
  5012: "Bangladesh", // Bashundhara Kings
  5027: "Greece", // Aiolikos
  5046: "Greece", // Kalamata
  5050: "Greece", // Kifisia
  5056: "Greece", // Niki Volos
  5172: "Nigeria", // Akwa United
  5177: "Nigeria", // Enyimba
  5179: "Nigeria", // Gombe United
  5183: "Nigeria", // Kano Pillars
  5185: "Nigeria", // Kwara United
  5188: "Nigeria", // Nasarawa United
  5190: "Nigeria", // Plateau United
  5222: "Zimbabwe", // Harare City
  5237: "Sudan", // Al Hilal Omdurman
  5242: "Iraq", // Al Shorta
  5250: "Spain", // Badalona
  5251: "Spain", // Barakaldo
  5252: "Spain", // CD Calahorra
  5253: "Spain", // CF Talavera
  5254: "Spain", // Castellón
  5258: "Spain", // Cornellà
  5262: "Spain", // FC Cartagena
  5264: "Spain", // Gimnástica Torrelavega
  5267: "Spain", // Marbella
  5268: "Spain", // Melilla
  5272: "Spain", // Ontinyent
  5274: "Spain", // Real Jaén
  5275: "Spain", // Real Murcia
  5277: "Spain", // Sant Andreu
  5282: "Spain", // Villanovense
  5285: "Senegal", // Casa Sport
  5296: "Senegal", // Teungueth
  5352: "Northern-Ireland", // Glentoran
  5490: "Azerbaijan", // Kapaz
  5499: "Azerbaijan", // Turan
  5503: "Azerbaijan", // Sumqayıt
  5508: "Nigeria", // Warri Wolves
  5627: "Ukraine", // Metalurh Zaporizhya
  5648: "China", // Chengdu Better City
  5684: "China", // Shenyang Urban
  5686: "China", // Sichuan Jiuniu
  5688: "China", // Suzhou Dongwu
  5695: "China", // Wuhan Three Towns
  5805: "Belgium", // Francs Borains
  5902: "Belgium", // RAAL La Louvière
  6004: "Denmark", // Aarhus Fremad
  6009: "Denmark", // B 93
  6026: "Denmark", // Hillerød
  6027: "Denmark", // Holbæk B&I
  6031: "Denmark", // Jammerbugt
  6040: "Denmark", // Marienlyst
  6056: "Denmark", // Skovshoved
  6077: "Iceland", // Augnablik
  6093: "Iceland", // Kormákur / Hvöt
  6144: "Israel", // Hakoah Ramat Gan
  6181: "Israel", // Ironi Tiberias
  6186: "Israel", // Maccabi Bnei Raina
  6215: "Belgium", // Dender
  6224: "Belgium", // RWDM
  6230: "Romania", // Csikszereda
  6231: "Romania", // Rapid
  6255: "Croatia", // Dubrava Zagreb
  6340: "Turkey", // 1461 Trabzon FK
  6342: "Turkey", // Vanspor FK
  6379: "Italy", // Lecco
  6407: "Jamaica", // Molynes United
  6411: "Ghana", // Asante Kotoko
  6431: "Zimbabwe", // SONIDEP
  6435: "Congo-DR", // TP Mazembe
  6498: "Ukraine", // Tavriya
  6501: "Ukraine", // Veres Rivne
  6526: "Turkey", // Karaman FK
  6538: "Turkey", // Somaspor
  6552: "Thailand", // Bangkok
  6553: "Thailand", // Bankhai United
  6578: "Thailand", // Nakhon Pathom
  6653: "Switzerland", // Yverdon Sport
  6655: "Sweden", // Akropolis
  6656: "Sweden", // Assyriska BK
  6657: "Sweden", // Astrio
  6658: "Sweden", // Bromölla
  6659: "Sweden", // Carlstad United
  6662: "Sweden", // Enskede
  6663: "Sweden", // Eskilsminne
  6666: "Sweden", // Gamla Upsala
  6669: "Sweden", // Gottne
  6670: "Sweden", // Grebbestad
  6671: "Sweden", // Gute
  6672: "Sweden", // Haninge
  6673: "Sweden", // Hittarp
  6674: "Sweden", // Hudiksvall
  6675: "Sweden", // Husqvarna
  6676: "Sweden", // Hässleholms IF
  6677: "Sweden", // Höganäs
  6679: "Sweden", // IFK Luleå
  6680: "Sweden", // IFK Timrå
  6681: "Sweden", // IFK Östersund
  6682: "Sweden", // Karlberg
  6683: "Sweden", // Karlskrona
  6684: "Sweden", // Karlstad
  6685: "Sweden", // Lidingö
  6686: "Sweden", // Lindome
  6687: "Sweden", // Lund
  6689: "Sweden", // Newroz
  6690: "Sweden", // Norrtälje
  6691: "Sweden", // Nyköping
  6692: "Sweden", // Oskarshamns AIK
  6693: "Sweden", // Qviding FIF
  6694: "Sweden", // Rosengård
  6695: "Sweden", // Rynninge
  6696: "Sweden", // Råslätts
  6697: "Sweden", // Sandviken
  6698: "Sweden", // Skövde AIK
  6699: "Sweden", // Sollentuna
  6700: "Sweden", // Stocksund
  6701: "Sweden", // Torns
  6702: "Sweden", // Trollhättan
  6703: "Sweden", // Tvååker
  6705: "Sweden", // Umeå FC
  6706: "Sweden", // Utsikten
  6708: "Sweden", // Vasalund
  6712: "Sweden", // Vinberg
  6714: "Sweden", // Värmbols
  6715: "Sweden", // Växjö United
  6757: "Scotland", // Annan Athletic
  6759: "England", // Berwick Rangers
  6762: "Scotland", // Clyde
  6767: "Scotland", // Elgin City
  6786: "Russia", // Akron
  6787: "Russia", // Alaniya Vladikavkaz
  6852: "Romania", // Ceahlăul Piatra Neamţ
  6910: "Romania", // U Craiova 1948
  6916: "Romania", // Unirea Slobozia
  6951: "Poland", // Resovia Rzeszów
  6953: "Poland", // Ruch Chorzów
  6962: "Poland", // Widzew Łódź
  6963: "Poland", // Zagłębie Lubin II
  6965: "Norway", // Alta
  6967: "Norway", // Asker
  6970: "Norway", // Brattvåg
  6974: "Norway", // Bærum
  6976: "Norway", // Egersund
  6982: "Norway", // Flekkerøy
  6985: "Norway", // Follo
  6987: "Norway", // Frigg
  6990: "Norway", // Fyllingsdalen
  6992: "Norway", // Gjøvik-Lyn
  6993: "Norway", // Grorud
  6998: "Norway", // Hønefoss
  7000: "Norway", // Junkeren
  7004: "Norway", // Kvik Halden
  7006: "Norway", // Lyn
  7007: "Norway", // Lysekloster
  7011: "Norway", // Mjølner
  7012: "Norway", // Moss
  7014: "Norway", // Nardo
  7017: "Norway", // Nybergsund
  7032: "Norway", // Steinkjer
  7033: "Norway", // Stjørdals-Blink
  7043: "Norway", // Vard
  7052: "Norway", // Ørn Horten
  7061: "South-Korea", // Cheongju
  7078: "South-Korea", // Gimpo Citizen
  7087: "South-Korea", // Hwaseong
  7145: "Japan", // Tochigi City
  7189: "England", // Arsenal U21
  7191: "England", // Brighton U21
  7196: "England", // Liverpool U21
  7276: "Czech-Republic", // Blansko
  7379: "Czech-Republic", // Vyškov
  7411: "Turkey", // Kocaelispor
  7513: "Greece", // Ionikos
  7520: "Egypt", // Masr
  7615: "England", // Basingstoke Town
  7673: "England", // Staines Town
  7715: "England", // Farnborough
  7730: "England", // Margate
  7745: "England", // Scarborough Athletic
  7779: "Brazil", // Ituano
  7780: "Brazil", // Madureira
  7784: "Brazil", // Parnahyba
  7787: "Brazil", // Treze
  7814: "Brazil", // Volta Redonda
  7815: "Brazil", // Macaé
  7822: "Brazil", // Bahia de Feira
  7826: "Brazil", // Ferroviária
  7833: "Brazil", // Maringá
  7835: "Brazil", // Portuguesa RJ
  7845: "Brazil", // Itumbiara
  7852: "Brazil", // Anápolis
  7854: "Brazil", // Bangu
  7863: "Brazil", // RB Brasil
  7864: "Brazil", // Sousa
  7865: "Brazil", // São Bernardo
  7870: "Brazil", // XV de Piracicaba
  7873: "Brazil", // Goianésia
  7875: "Brazil", // J. Malucelli
  7883: "Italy", // Atalanta U19
  7886: "Germany", // Bayer Leverkusen U19
  7893: "Belgium", // Club Brugge U19
  7899: "Spain", // Elfsborg U19
  7915: "Spain", // Midtjylland U19
  7966: "Italy", // Roma U19
  7975: "Iceland", // Breidablik U19
  7982: "Jamaica", // Hammarby U19
  8007: "Canada", // Whitecaps
  8011: "Philippines", // Ceres
  8029: "Palestine", // Hilal Al-Quds
  8044: "Maldives", // Maziya
  8079: "Ghana", // Aduana Stars
  8148: "England", // Darlington
  8157: "Spain", // FC Andorra
  8160: "Spain", // Intercity
  8259: "Austria", // Schwarz-Weiß Bregenz
  8374: "Argentina", // Fénix
  8379: "Argentina", // San Miguel
  8540: "Bulgaria", // Belasitsa
  8605: "Croatia", // Jarun
  8615: "Croatia", // Zrinski Jurjevac
  8653: "England", // Gloucester City
  8657: "England", // Bath City
  8660: "England", // Hemel Hempstead Town
  8663: "England", // Wealdstone
  8664: "England", // Welling United
  8802: "England", // Hadley
  9013: "USA", // Ann Arbor
  9030: "USA", // Miami FC
  9043: "USA", // Detroit City
  9049: "USA", // Jacksonville Armada
  9058: "USA", // NY Cosmos B
  9136: "United-Arab-Emirates", // Al Bataeh
  9139: "United-Arab-Emirates", // Al Urooba
  9140: "United-Arab-Emirates", // Dibba Al Hisn
  9160: "Vietnam", // Binh Dinh
  9166: "Vietnam", // Pho Hien
  9173: "Finland", // JäPS
  9175: "Finland", // MP
  9184: "Finland", // Honka Akatemia
  9185: "Finland", // Ilves II
  9187: "Finland", // KäPa
  9198: "Finland", // SJK Akatemia
  9209: "Finland", // HJS Akatemia
  9247: "France", // Boulogne-Billancourt
  9268: "France", // Bourgoin-Jallieu
  9328: "Germany", // Greuther Fürth II
  9361: "Germany", // Bayern Alzenau
  9364: "Germany", // Hoffenheim II
  9371: "Germany", // Köln II
  9380: "Spain", // Amorebieta
  9381: "Spain", // Atlético Baleares
  9382: "Spain", // Badajoz
  9385: "Spain", // Coruxo
  9390: "Spain", // Ibiza
  9392: "Spain", // L'Hospitalet
  9393: "Spain", // La Nucía
  9398: "Spain", // Linares Deportivo
  9399: "Spain", // Llagostera
  9403: "Spain", // Olot
  9409: "Spain", // Racing Ferrol
  9412: "Spain", // SS Reyes
  9416: "Spain", // Tarazona
  9456: "Italy", // Pro Sesto
  9568: "USA", // Inter Miami
  9569: "USA", // Nashville SC
  9570: "Spain", // Atlético Madrid II
  9573: "Spain", // Internacional de Madrid
  9580: "Spain", // Burgos
  9581: "Spain", // Calahorra
  9589: "Spain", // Ejea
  9592: "Spain", // Prat
  9593: "Spain", // Sabadell
  9594: "Spain", // Valencia II
  9596: "Spain", // Linense
  9597: "Spain", // Algeciras
  9601: "Spain", // Sanluqueño
  9603: "Spain", // Alondras
  9671: "Spain", // Figueres
  9675: "Spain", // Manresa
  9686: "Spain", // Alcoyano
  9688: "Spain", // Atzeneta
  9692: "Spain", // Eldense
  9699: "Spain", // Saguntino
  9736: "Spain", // Real Ávila
  9739: "Spain", // Vélez
  9742: "Spain", // Antequera
  9745: "Spain", // El Palo
  9767: "Spain", // San Roque Lepe
  9770: "Spain", // Xerez
  9772: "Spain", // Écija
  9781: "Spain", // Ibiza Islas Pitiusas
  9791: "Spain", // Atlético Paso
  9793: "Spain", // Buzanada
  9820: "Spain", // Real Murcia II
  9835: "Spain", // Montijo
  9900: "Spain", // Guadalajara
  9905: "Spain", // Manchego
  9926: "France", // UF Touraine
  9976: "Norway", // Øygarden
  9991: "USA", // San Diego Loyal
  10006: "Brazil", // Águia Negra
  10023: "Brazil", // Portuguesa Santista
  10024: "Brazil", // Rio Claro
  10026: "Brazil", // Taubaté
  10038: "Brazil", // Paulista
  10043: "Brazil", // Pelotas
  10049: "Brazil", // Guarany de Bagé
  10056: "Brazil", // União RS
  10059: "Estonia", // Nõmme United
  10076: "Faroe-Islands", // Hoyvík
  10086: "Thailand", // Khon Kaen United
  10088: "Thailand", // Uthai Thani
  10099: "Canada", // Manitoba
  10114: "Norway", // Vålerenga II
  10124: "Latvia", // Riga
  10134: "Indonesia", // Persija
  10137: "Italy", // Cosenza
  10139: "Spain", // AD Ceuta FC
  10140: "Spain", // Mérida AD
  10155: "United-Arab-Emirates", // Al Nasr
  10157: "England", // Darlington 1883
  10169: "Canada", // Atlético Ottawa
  10199: "Finland", // KPV-j
  10244: "Belgium", // Seraing United
  10283: "USA", // Union Omaha
  10416: "Kazakhstan", // FK Aksu
  10507: "Saudi-Arabia", // Al Jandal
  10509: "Saudi-Arabia", // Al Kholood
  10524: "Saudi-Arabia", // Al Zulfi
  10543: "Slovakia", // Slavoj Trebišov
  10544: "Slovakia", // Slovan Bratislava II
  10561: "South-Africa", // Hungry Lions
  10582: "South-Africa", // Orbit College
  10593: "Switzerland", // Old Boys
  10598: "Tunisia", // Ariana
  10625: "Tunisia", // Olympique Béja
  10669: "Finland", // PK-35
  10671: "Brazil", // CRAC
  10674: "Brazil", // Goiânia
  10677: "Brazil", // Marcílio Dias
  10697: "Ukraine", // Metalist
  10862: "Brazil", // Amazonas
  10874: "USA", // Oakland Roots
  11065: "Iraq", // Al Minaa Basra
  11070: "Iraq", // Erbil
  11099: "Turkey", // Kayseri Erciyesspor
  11134: "Vietnam", // Hồng Lĩnh Hà Tĩnh
  11225: "Austria", // LASK Juniors
  11238: "Azerbaijan", // Araz
  11490: "Denmark", // Vestsjælland
  11566: "Denmark", // Sundby
  11659: "Sweden", // IF Karlstad
  11660: "Sweden", // Karlslund
  11661: "Sweden", // Sylvia
  11662: "Sweden", // Umea FF
  11663: "Sweden", // Täby
  11664: "Sweden", // Örebro Syrianska
  11665: "Sweden", // Boden
  11666: "Sweden", // Forward
  11667: "Sweden", // Linköping City
  11668: "Sweden", // Arameiska / Syrianska
  11669: "Sweden", // Skellefteå
  11670: "Sweden", // Sleipner
  11671: "Sweden", // Piteå
  11672: "Sweden", // Assyriska Turabdin
  11673: "Sweden", // Motala
  11674: "Sweden", // Oddevold
  11675: "Sweden", // Kristianstad
  11676: "Sweden", // Höllviken
  11677: "Sweden", // Prespa Birlik
  11913: "England", // West Bromwich Albion U21
  12189: "Tanzania", // Coastal Union
  12249: "Ghana", // Hearts of Oak
  12250: "Ghana", // Inter Allies
  12256: "Ghana", // WAFA
  12260: "Greece", // Atromitos
  12277: "Brazil", // Ipatinga
  12295: "Brazil", // Friburguense
  12300: "Brazil", // Concórdia
  12316: "Serbia", // IMT Novi Beograd
  12319: "Serbia", // Jedinstvo Ub
  12329: "Serbia", // OFK Vršac
  12335: "Serbia", // Radnički Novi Beograd
  12360: "Serbia", // Železničar Pančevo
  12372: "Greece", // Makedonikos Neapolis
  12403: "Greece", // Marko
  12414: "Greece", // Paniliakos
  12424: "Libya", // Al Ahli Tripoli
  12570: "Sweden", // Ahlafors
  12573: "Sweden", // Lidköping
  12575: "Sweden", // Stenungsund
  12576: "Sweden", // Sävedalen
  12578: "Sweden", // Enköping
  12583: "Sweden", // Kvarnsveden
  12584: "Sweden", // Skiljebo
  12585: "Sweden", // Stockholm Internazionale
  12586: "Sweden", // Friska Viljor
  12591: "Sweden", // Stöde
  12594: "Sweden", // Ytterhogdal
  12596: "Sweden", // Huddinge
  12597: "Sweden", // IFK Eskilstuna
  12598: "Sweden", // Kumla
  12599: "Sweden", // Trosa-Vagnhärad SK
  12601: "Sweden", // Olympic
  12602: "Sweden", // Eslov
  12603: "Sweden", // Halmia
  12604: "Sweden", // IFK Malmö
  12605: "Sweden", // Limhamn Bunkeflo 07
  12606: "Sweden", // Onsala
  12607: "Sweden", // Ullared
  12608: "Sweden", // Varbergs GIF
  12609: "Sweden", // Västra Frölunda
  12611: "Sweden", // Asarum
  12612: "Sweden", // Berga
  12613: "Sweden", // Dalstorps
  12614: "Sweden", // IFK Hässleholm
  12615: "Sweden", // Karlshamn
  12616: "Sweden", // Nosaby
  12617: "Sweden", // Räppe
  12618: "Sweden", // Tord
  12619: "Sweden", // Österlen
  12620: "Sweden", // Torslanda
  12622: "Sweden", // FBK Karlstad
  12624: "Sweden", // Skoftebyn
  12626: "Sweden", // Gunnilse
  12632: "Sweden", // Aspudden-Tellus
  12633: "Sweden", // Eskilstuna City
  12635: "Sweden", // Syrianska IF
  12636: "Sweden", // Boo
  12637: "Sweden", // Värmdö
  12638: "Sweden", // Västerås IK
  12644: "Sweden", // Ånge
  12645: "Sweden", // Tyresö
  12647: "Sweden", // Södertälje
  12650: "Sweden", // Smedby
  12651: "Sweden", // Vimmerby
  12653: "Sweden", // Högaborg
  12654: "Sweden", // Kvarnby
  12655: "Sweden", // Tenhult
  12656: "Sweden", // Akademi HIF
  12657: "Sweden", // Laholm
  12660: "Sweden", // Sölvesborg
  12661: "Sweden", // Nybro
  12662: "Sweden", // BW 90
  12733: "Kosovo", // Ballkani
  12772: "Kosovo", // Gjilani
  12831: "Germany", // Phönix Lübeck
  12914: "Brazil", // Rio Branco PR
  12936: "Brazil", // Andraus Brasil
  13080: "Brazil", // Democrata GV
  13084: "Brazil", // Pouso Alegre
  13094: "Brazil", // Piauí
  13104: "Brazil", // América RJ
  13107: "Brazil", // Audax Rio
  13108: "Brazil", // Barra da Tijuca
  13121: "Brazil", // Boca Júnior
  13122: "Brazil", // Dorense
  13152: "Estonia", // Legion
  13170: "Saudi-Arabia", // Al-Ain
  13188: "USA", // San Antonio Scorpions
  13320: "Thailand", // Kasem Bundit University
  13382: "Turkey", // Mersin Talimyurdu SK
  13471: "Finland", // Hämeenlinna
  13582: "Finland", // Kerho 07 (SJK II)
  13810: "Sweden", // Åmål
  13882: "Ghana", // Heart of Lions
  13975: "Brazil", // Athletic Club
  13976: "Azerbaijan", // Sabah FA
  13977: "New-Zealand", // Eastern Suburbs
  14000: "Brazil", // CFRJ / Maricá
  14108: "Sweden", // Angered BK
  14109: "Sweden", // Boxholm
  14126: "Cyprus", // Omonia 29is Maiou
  14130: "Belgium", // Club Brugge II
  14235: "Netherlands", // Hoogeveen
  14261: "Serbia", // Mladost Novi Sad
  14281: "Kosovo", // Drita
  14403: "Kosovo", // Trepça Mitrovicë
  14510: "Sweden", // Nacka Iliria
  14562: "Poland", // Motor Lublin
  14651: "Egypt", // Ceramica Cleopatra
  15130: "Portugal", // Estrela
  15541: "Iran", // Havadar
  15544: "Iraq", // Al Karkh
  15547: "Iraq", // Zakho
  15550: "Australia", // Macarthur
  15576: "Kosovo", // Malisheva
  15622: "Brazil", // São José EC
  15633: "England", // Burnley U23
  15638: "England", // Tottenham Hotspur U23
  15656: "Italy", // Bologna U19
  15667: "Italy", // Genoa U19
  15669: "Italy", // Lecce U19
  15670: "Italy", // Milan U19
  15683: "Italy", // Torino U19
  15686: "Italy", // Verona U19
  15736: "Egypt", // Pharco
  16131: "Gibraltar", // Europa Point
  16239: "Poland", // Polonia Warszawa
  16465: "Brazil", // Jataiense
  16489: "USA", // Austin
  16596: "Sweden", // Hammarby Talang
  16597: "Sweden", // Arlanda
  16598: "Sweden", // Järfälla
  16601: "Sweden", // United Nordic
  16605: "Sweden", // IFK Skövde
  16611: "Kazakhstan", // Zhenys
  16619: "China", // Nanjing City
  16745: "Sweden", // Rågsved
  16746: "Sweden", // Viken
  16801: "Gambia", // Fortune
  16804: "Gambia", // Real de Banjul
  16856: "Russia", // Dinamo Vladivostok
  16859: "Russia", // Krasava Odintsovo
  17103: "France", // UNFP
  17115: "Poland", // Wieczysta Kraków
  17147: "Italy", // Trento
  17161: "Ukraine", // LNZ Cherkasy
  17264: "China", // Hebei Kungfu
  17265: "China", // Qingdao Youth Island
  17306: "Bulgaria", // Levski Krumovgrad
  17358: "Romania", // Brașov Steagul Renaște
  17558: "Spain", // Torre del Mar
  17562: "Spain", // UD San Pedro
  17692: "Portugal", // CF Os Belenenses
  17698: "Sweden", // Malmö FF U19
  17902: "Indonesia", // Dewa United
  17992: "Ghana", // Accra Lions
  18009: "India", // Rajasthan United
  18016: "Greece", // AEK Athens II
  18310: "USA", // Charlotte
  18358: "USA", // Northern Colorado
  18424: "Sweden", // Landvetter IS
  18758: "Finland", // KuPS Akatemia
  18813: "USA", // Houston Dynamo FC II
  18814: "USA", // Minnesota United II
  18924: "Norway", // Gamle Oslo
  18930: "Norway", // Råde
  18999: "Sweden", // Lucksta
  19636: "Brazil", // Carlos Renaux
  19685: "Belgium", // KAA Gent II
  19732: "Slovenia", // Zavrč
  19838: "Tanzania", // Fountain Gate
  20034: "Romania", // Corvinul Hunedoara
  20081: "England", // Burnley U21
  20227: "Sweden", // AIK U19
  20233: "Denmark", // København U19
  20262: "Spain", // Badalona II
  20462: "Congo", // Jeunesse Unie de Kintélé
  20463: "Iraq", // Duhok
  20717: "Brazil", // Porto Vitória
  20778: "Brazil", // Crateús
  20787: "USA", // St. Louis City
  20835: "Sweden", // Farsta
  20838: "Sweden", // Viggbyholms IK
  20881: "Canada", // Vancouver FC
  20960: "Peru", // Deportivo Garcilaso
  21030: "Sweden", // Klagshamn
  21203: "Ukraine", // Khust City
  21208: "Venezuela", // Marítimo
  21289: "USA", // Sarasota Paradise
  21359: "Sweden", // Jonsered
  21435: "Sweden", // Ariana
  21538: "Russia", // Dinamo Kirov
  21539: "Russia", // Irkutsk
  21858: "Honduras", // Génesis
  22153: "Macedonia", // Bashkimi Kumanovo
  22422: "Spain", // Valencia U21
  22761: "Ghana", // Attram de Visser
  22819: "Brazil", // Carmópolis
  22932: "Sweden", // Falu BS
  22948: "Brazil", // Independente SP
  22951: "Brazil", // Rio Branco SP
  23177: "England", // Huddersfield Town U18
  23269: "China", // Guangzhou E-Power
  23286: "China", // Shaanxi Union
  23307: "Brazil", // Trindade
  23407: "Kenya", // MOFA
  24030: "Sweden", // Kubikenborg
  24205: "Italy", // Milan II
  24608: "New-Zealand", // Auckland
  24725: "Italy", // Atalanta U20
  24726: "Italy", // Bologna U20
  24742: "Italy", // Torino U20
  24981: "Sweden", // IFK Göteborg U19
  25005: "Brazil", // FF Sport Nova Cruz
  25063: "Iraq", // Al-Karma
  25070: "Senegal", // Wally Daan
  25318: "Azerbaijan", // Safa Baku
  25484: "USA", // San Diego
  25569: "Sweden", // Skara
  25570: "Sweden", // Eker Örebro
  25573: "Kazakhstan", // Växjö Norra
  25575: "Sweden", // Böljan
  25576: "Sweden", // Hestrafor
  26130: "Belgium", // Daring
  26299: "South-Africa", // Siwelele
  26588: "Greece", // Apollon Kalyt.
  26598: "Iraq", // Mosul
  26618: "Sweden", // Brommapojkarna U19
  26890: "Sweden", // Fittja
  26891: "Sweden", // Staffanstorp United
  26963: "India", // SC Delhi
  27669: "Sweden", // AFC Malmo
  27994: "United-Arab-Emirates", // Forte Virtus
};

/** Klubbens land enligt api-football, eller null om klubben inte är uppslagen. */
export function getClubCountry(externalId: number | null | undefined): string | null {
  if (externalId == null) return null;
  return CLUB_COUNTRY[externalId] ?? null;
}
