// Steps of the training and the exam for lesson 1 ("Strzelanie z SpKW/Z"), in the order of the procedure.
// play: narration keys of the timeline played after the answer (together they cover every key once, in order).
// hold: the frame shown while the question waits ({ key, u }); default: the start of play[0].
// play skips the keys the trainee has just done himself (author, 19 XI: the search with the scope is not replayed).
// Kinds: action (click the part, pick the action), choice, number, wind (speed and side), mark (range card), dial (the student's own
// settings; graded by the shot itself, see conditions.js). Values may be functions of the drawn conditions c.
// the target on the range card (svg 400 x 232, stand at 200, 210, 190 px = 1000 m), the same in scene1.js
export const cardPoint = c => { const r = c.range * 0.19, a = (c.bearing ?? 0) * Math.PI / 180; return { x: 200 + r * Math.sin(a), y: 210 - r * Math.cos(a) }; };
const fromText = c => `Z godziny ${c.windFrom}, czyli ${c.windFrom > 6 ? "z lewej" : "z prawej"}${c.windFrom === 3 || c.windFrom === 9 ? "" : c.windFrom < 3 || c.windFrom > 9 ? " i z przodu" : " i z tyłu"}`;

// the training is grouped into four sections over the 18 scenes of the lesson (author, 18 XI); a run started at a
// section goes on through the following ones
export const SECTIONS = [
  { n: 1, title: "Czynności przed strzelaniem", scenes: [1, 7] },
  { n: 2, title: "Pomiar odległości", scenes: [8, 12] },
  { n: 3, title: "Nastawa i strzał", scenes: [13, 16] },
  { n: 4, title: "Zakończenie strzelania", scenes: [17, 18] },
];
export const sectionOf = chapter => SECTIONS.find(x => chapter >= x.scenes[0] && chapter <= x.scenes[1]) || SECTIONS[SECTIONS.length - 1];

export const STEPS = [
  { id: "ears", chapter: 1, kind: "action", anywhere: true, target: "ear_defenders", hold: { key: "s01.intro", u: 0.3 }, action: "Załóż ochronniki słuchu",
    ask: "Przygotuj się do wyjścia na linię: zadbaj o słuch.", play: ["s01.cmd", "s01.intro", "s01.carry", "s01.ears"],
    hint: "Ochronniki aktywne tłumią huk, ale przepuszczają mowę. Kliknij gdziekolwiek i wybierz z menu czynność, która chroni słuch." },
  { id: "load", chapter: 2, kind: "action", target: "magazine_hand", hold: { key: "s02.load", u: 0.05 }, action: "Załaduj trzy naboje do magazynka",
    ask: "Komenda: „Trzema – magazynki ładuj!”.", play: ["s02.cmd", "s02.load"],
    hint: "Wciskasz naboje kolejno do magazynka, każdy do końca. Kliknij magazynek." },
  { id: "pouch", chapter: 2, kind: "action", target: "ammo_pouch", hold: { key: "s02.pouch", u: 0.25 }, action: "Schowaj magazynek do ładownicy",
    ask: "Magazynek jest załadowany. Co z nim teraz?", play: ["s02.pouch"],
    hint: "Do karabinu podepniesz go dopiero na komendę „Ładuj”. Do tego czasu leży w ładownicy." },
  { id: "walk", chapter: 3, kind: "choice", ask: "Komenda: „Zmiana, na linię otwarcia ognia – marsz!”. Co robisz?",
    options: ["Przechodzę na stanowisko i klękam, lufa w stronę kulochwytu", "Kładę się od razu na linii wyjściowej", "Podpinam magazynek i idę na stanowisko", "Czekam na komendę „Ognia”"],
    correct: "Przechodzę na stanowisko i klękam, lufa w stronę kulochwytu", play: ["s03.cmd", "s03.walk", "s03.kneel"],
    hint: "Na stanowisku klękasz i zdejmujesz karabin z pasa. Lufa cały czas patrzy w stronę kulochwytu." },
  { id: "bipod", chapter: 3, kind: "action", target: "bipod_folded", hold: { key: "s03.kneel", u: 0.05 }, action: "Rozłóż dwójnóg",
    ask: "Postaw karabin na stanowisku.", play: ["s03.bipod", "s03.place"],
    hint: "Obie nogi dwójnogu muszą się zatrzasnąć w tym samym położeniu. Kliknij złożony dwójnóg pod łożem." },
  { id: "open", chapter: 4, kind: "action", target: "charging_handle", hold: { key: "s04.why", u: 0.3 }, action: "Odciągnij napinacz i zablokuj suwadło w tyle",
    ask: "Zanim zrobisz cokolwiek innego, sprawdź, czy broń jest rozładowana.", play: ["s04.why", "s04.open"],
    hint: "Odciągasz rączkę napinacza i naciskasz dźwignię zaczepu suwadła. Kliknij rączkę napinacza." },
  { id: "look", chapter: 4, kind: "action", target: "upper_receiver", hold: { key: "s04.open", u: 0.8 }, action: "Obejrzyj gniazdo magazynka i komorę zamkową",
    ask: "Suwadło jest w tyle. Co sprawdzasz?", play: ["s04.look"],
    hint: "Patrzysz przez okno wyrzutowe: gniazdo magazynka puste, w komorze ani naboju, ani łuski." },
  { id: "finger", chapter: 4, kind: "action", target: "upper_receiver", hold: { key: "s04.finger", u: 0.97 }, action: "Sprawdź komorę nabojową palcem",
    ask: "Wzrok może przeoczyć nabój w cieniu. Co jeszcze?", play: ["s04.finger", "s04.glove"],
    hint: "Palec wyczuje to, czego nie widać. Kliknij komorę zamkową." },
  { id: "caps", chapter: 5, kind: "action", target: "scope_cap_front", hold: { key: "s05.caps", u: 0.05 }, action: "Odchyl zakrywki lunety",
    ask: "Przygotuj lunetę do strzelania.", play: ["s05.caps"],
    hint: "Zakrywki chronią szkło w marszu. Obiektyw odchylasz do góry, okular w bok. Kliknij zakrywkę z przodu lunety." },
  { id: "zeroElev", chapter: 5, kind: "action", target: "scope_elevation", hold: { key: "s05.caps", u: 0.55 }, action: "Ustaw bęben na zero",
    ask: "Bęben wysokości pokazuje 0,8. Popraw to.", play: ["s05.turrets", "s05.elev"],
    hint: "Przed strzelaniem oba bębny stoją na zerze. Bęben wysokości jest na górze lunety." },
  { id: "zeroWind", chapter: 5, kind: "action", target: "scope_windage", hold: { key: "s05.wind", u: 0.8 }, action: "Ustaw bęben na zero",
    ask: "Bęben poprawek bocznych pokazuje 0,2 w prawo. Popraw to.", play: ["s05.wind"],
    hint: "Bęben poprawek bocznych jest z prawej strony lunety." },
  { id: "prone", chapter: 6, kind: "choice", ask: "Jak układasz się za karabinem?",
    options: ["Ciało w jednej linii za bronią", "Ciało w poprzek broni, nogi razem", "Na boku, z nogami skrzyżowanymi", "Bokiem do celu, łokcie szeroko"],
    correct: "Ciało w jednej linii za bronią", play: ["s06.prone"],
    hint: "Ciało w linii za bronią sprawia, że odrzut idzie prosto w ramię." },
  { id: "bag", chapter: 6, kind: "action", target: "bag", hold: { key: "s06.bag", u: 0.05 }, action: "Ściśnij worek lewą dłonią, żeby ustawić tył karabinu",
    ask: "Siatka nie stoi na wysokości celu. Jak ją podnieść albo opuścić bez ruszania dwójnogu?", play: ["s06.bag", "s06.cheek"],
    hint: "Ściskając worek pod kolbą, podnosisz albo opuszczasz tył karabinu o milimetry. Kliknij worek." },
  { id: "mag", chapter: 7, kind: "action", target: "ammo_pouch", hold: { key: "s06.cheek", u: 0.97 }, action: "Wyjmij magazynek i podepnij go do karabinu",
    ask: "Komenda: „Ładuj!”.", play: ["s07.cmd", "s07.mag"],
    hint: "Magazynek wyjmujesz z ładownicy, podpinasz i lekko szarpiesz w dół, żeby sprawdzić, czy się trzyma." },
  { id: "chamber", chapter: 7, kind: "action", target: "lower_receiver", hold: { key: "s07.chamber", u: 0.55 }, action: "Naciśnij dźwignię zaczepu suwadła",
    ask: "Magazynek jest podpięty, suwadło w tyle. Dośle nabój.", play: ["s07.chamber"],
    hint: "Dźwignia zaczepu suwadła jest na lewym boku komory spustowej. Po jej naciśnięciu suwadło dosyła nabój." },
  // find: the trainee searches the ground with the scope (3x) and lays the cross on the gong (author, 18 XI)
  { id: "scan", chapter: 8, kind: "find", ask: "Komenda: „Do celu – gong czerwony, na wprost…”. Odległości nie podano. Znajdź cel w lunecie i najedź na niego krzyżem.",
    hold: { key: "s08.scan", u: 0 }, play: ["s08.cmd"],
    hint: "Przy najmniejszym powiększeniu widzisz najszerzej. Pasy od lewej do prawej, coraz dalej: nic nie pominiesz." },
  { id: "zoom", chapter: 8, kind: "choice", ask: "Cel znaleziony. Co z powiększeniem?",
    options: ["Zwiększam do 12×, żeby dokładnie zmierzyć cel", "Zostawiam 3×", "Zmniejszam, żeby widzieć teren", "Nie ma znaczenia"],
    correct: "Zwiększam do 12×, żeby dokładnie zmierzyć cel", play: ["s08.found"],
    hint: "Siatka mil-dot mierzy przy każdym powiększeniu, ale przy 12× odczyt jest najdokładniejszy." },
  { id: "height", chapter: 9, kind: "number", unit: "mil", answer: c => 1000 / c.range, tol: 0.1, hold: { key: "s09.height", u: 0.05 }, scopeDrag: true,
    ask: "Odczytaj w siatce wysokość gongu.", play: ["s09.why", "s09.height"],
    hint: "Gong ma 1,0 m wysokości. Postaw górną krawędź na kresce i policz punkty do dolnej krawędzi: odstęp między środkami punktów to 1 mil." },
  { id: "width", chapter: 9, kind: "number", unit: "mil", answer: c => 500 / c.range, tol: 0.1, hold: { key: "s09.width", u: 0.05 }, scopeDrag: true,
    ask: "Odczytaj w siatce szerokość gongu.", play: ["s09.width", "s09.note"],
    hint: "Gong ma 0,5 m szerokości. Liczysz tak samo, w poziomie." },
  // speed and direction in one question (author, 19 XI)
  { id: "wind", chapter: 10, kind: "wind", tol: 0.2, correct: fromText, hold: { key: "s10.reading", u: 0.6 },
    hours: [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],   // the answer is a clock hour (wind from any hour, author, 20 XI)
    ask: "Odczytaj z Kestrela prędkość wiatru i określ, skąd wieje.", play: ["s10.look", "s10.kestrel", "s10.reading", "s10.note"],
    hint: "Kestrel trzymasz wiatraczkiem do wiatru, aż wynik się ustali; prędkość jest w wierszu WIND. Kierunek, z którego wieje, pokazuje DIR jako godzinę: 12 to kierunek strzału, 3 z prawej, 9 z lewej." },
  { id: "range", chapter: 11, kind: "number", unit: "m", answer: c => c.range, tol: "5%", hold: { key: "s10.note", u: 0.97 },   /* not on the formula: it shows the result */
    ask: "Oblicz odległość do celu ze swoich odczytów.", play: ["s11.formula", "s11.height", "s11.width"],
    hint: "Odległość [m] = wymiar celu [m] × 1000 / odczyt [mil]. Policz z wysokości i z szerokości; wyniki powinny być bliskie." },
  // direction by eye (author, 19 XI): the view from behind the shooter along the stand's axis, a pulsing line to the
  // target; the target's place is drawn with the conditions
  { id: "direction", chapter: 11, kind: "choice", ordered: true, hold: { key: "s11.dir", u: 0.3 },
    ask: "Określ na oko kierunek do migającego celu. Linia pokazuje godzinę 12, czyli oś stanowiska.",
    options: ["Godzina 10", "Godzina 11", "Godzina 12", "Godzina 1", "Godzina 2"], correct: c => `Godzina ${c.clock ?? 12}`, play: ["s11.dir"],
    hint: "Linia to godzina 12, kierunek na wprost stanowiska. Porównaj z nią cel: jedna godzina to 30°, godzina 1 to 30° w prawo, godzina 11 to 30° w lewo." },
  { id: "card", chapter: 12, kind: "mark", tol: 12, mark: c => ({ overlay: "card", ...cardPoint(c) }),
    ask: "Zaznacz cel na karcie ognia.", play: ["s12.card", "s12.target", "s12.weather", "s12.sun"],
    hint: "Łuki są co 100 m, środek dołu karty to twoje stanowisko, a pionowa oś to godzina 12. Postaw punkt na łuku twojej odległości, w kierunku, który określiłeś." },
  { id: "parallax", chapter: 13, kind: "action", target: "scope_parallax", hold: { key: "s13.elev", u: 0.5 }, action: "Ustaw paralaksę na odległość do celu",
    ask: "Cel jest nieostry, a siatka pływa po celu, gdy ruszasz głową.", play: ["s12.dope", "s13.parallax"],
    hint: "Pokrętło paralaksy jest z lewej strony lunety. Ustaw je na odległość do celu." },
  { id: "dial", chapter: 13, kind: "dial",
    ask: "Odczytaj z tabel nastawy na swoją odległość i wiatr i ustaw je na bębnach.", play: ["s13.elev", "s13.wind"],
    hint: "Wysokość: znajdź w tabeli wiersze nad i pod twoją odległością i weź wartość pomiędzy. Wiatr: poprawka z tabeli na 1 m/s razy prędkość wiatru, razy wartość wiatru: z godziny 3 i 9 pełna, z 2, 4, 8 i 10 prawie pełna (×0,9), z 1, 5, 7 i 11 połowa. Wiatr z lewej (7–11) to poprawka w lewo, z prawej (1–5) w prawo. Tabele są dla 15 °C i 1010 hPa. Na każde 10 °C chłodniej dodaj do wysokości około 1 % na 300 m, 2 % na 600 m i 3 % na 900 m, a na każde 10 hPa więcej około 0,5 %. Cieplej albo przy niższym ciśnieniu ujmij tyle samo." },
  { id: "safety", chapter: 14, kind: "action", target: "safety_selector", hold: { key: "s14.safety", u: 0.05 }, action: "Przestaw bezpiecznik z Z na P",
    ask: "Komenda: „Ognia!”.", play: ["s14.cmd", "s14.safety"],
    hint: "Skrzydełko bezpiecznika jest nad chwytem. Z to zabezpieczony, P to ogień pojedynczy." },
  // fire (author, 20 XI): three live shots in one step - the breathing chart, the cross held on the target with the
  // mouse, the shot when the button is let go in the respiratory pause; after a miss the settings may be changed.
  // The timeline's own shots (s15.*, s16.repeat, s16.weld) are not played: the trainee has just fired them
  { id: "shot", chapter: 15, kind: "fire", shots: [0, 1, 2], hold: { key: "s15.trigger", u: 0.6 },
    ask: "Oddaj trzy strzały. Strzelaj w pauzie po wydechu.", play: ["s16.group", "s16.empty"],
    hint: "Patrz na wykres oddechu. Po wydechu siatka na chwilę się uspokaja: wtedy puść przycisk, płynnie, nie szarpiąc myszą. Po pudle sprawdź nastawy: pocisk wyżej – zmniejsz wysokość, w lewo – poprawka w prawo." },
  { id: "safe", chapter: 17, kind: "action", target: "safety_selector", hold: { key: "s17.safe", u: 0.8 }, action: "Przestaw bezpiecznik z P na Z",
    ask: "Komenda: „Przerwij ogień!”.", play: ["s17.cmd", "s17.safe"],
    hint: "Na tę komendę od razu zabezpieczasz broń." },
  { id: "unload", chapter: 17, kind: "action", target: "magazine_release", hold: { key: "s17.safe", u: 0.05 }, action: "Odepnij magazynek i zajrzyj do niego",
    ask: "Komenda: „Rozładuj!”.", play: ["s17.cmd2", "s17.unload"],
    hint: "Zatrzask magazynka jest przed kabłąkiem spustu. Odpinasz magazynek i sprawdzasz, czy nie został w nim nabój." },
  { id: "finger2", chapter: 17, kind: "action", target: "upper_receiver", hold: { key: "s17.unload", u: 0.05 }, action: "Sprawdź komorę nabojową palcem",
    ask: "Magazynek odpięty. Co jeszcze, zanim zgłosisz broń?", play: ["s17.finger"],
    hint: "Tak samo jak na początku: palec w komorze. Suwadło zostaje w tyle." },
  { id: "inspect", chapter: 18, kind: "choice", ask: "Komenda: „Do przejrzenia broń!”. Co robisz?",
    options: ["Zostawiam broń z otwartą komorą i czekam, aż instruktor ją sprawdzi", "Zamykam komorę i wstaję", "Podaję karabin instruktorowi", "Zakładam karabin na pas"],
    correct: "Zostawiam broń z otwartą komorą i czekam, aż instruktor ją sprawdzi", play: ["s18.cmd", "s18.inspect", "s18.checked", "s18.rule"],
    hint: "Broń jest rozładowana dopiero, gdy instruktor sam ją sprawdzi i powie „Sprawdziłem”." },
  { id: "log", chapter: 18, kind: "choice", ask: "Co zapisujesz w notesie po strzelaniu?",
    options: ["Oddane strzały i miejsca trafień", "Nic, wszystko jest na karcie ognia", "Tylko liczbę trafień", "Numer karabinu"],
    correct: "Oddane strzały i miejsca trafień", play: ["s18.log"],
    hint: "Te zapisy przydadzą się przy następnym strzelaniu na tę odległość." },
  { id: "back", chapter: 18, kind: "choice", ask: "Komenda: „Powstań!”. Co robisz?",
    options: ["Wstaję i zakładam karabin na pas", "Wstaję i zostawiam karabin", "Biorę karabin w ręce lufą do góry", "Czekam w leżeniu"],
    correct: "Wstaję i zakładam karabin na pas", play: ["s18.cmd2", "s18.stand", "s18.cmd3", "s18.back"],
    hint: "Wstajesz, karabin na pas, i na komendę wracasz na linię wyjściową." },
];

// scenario 2 (author, 20 XI): three targets from the nearest to the farthest, two shots at each; a target is hit
// when both shots hit, then the trainee goes on to the next one either way. In phases (author, 20 XI, later):
// find all three, measure each (from its height only), judge the directions, put all three on the range card (only
// the direction is graded there), then the shooting, target by target, with the range card in the corner
export const SCENARIOS = [{ n: 1, title: "Jeden cel, trzy strzały" }, { n: 2, title: "Trzy cele, po dwa trafienia" }, { n: 3, title: "Para strzelec–obserwator, cel na trybunie" }];
export function scenarioSteps(n) {
  if (n === 3) return scenario3Steps();
  if (n !== 2) return STEPS;
  const by = id => STEPS.find(s => s.id === id), first = STEPS.findIndex(s => s.id === "scan"), after = STEPS.findIndex(s => s.id === "safe");
  const T = [0, 1, 2], nr = t => t + 1;
  // tgt: the target's number (target is the clicked part); corner: the range card in the top right corner
  const mk = (id, t, o = {}) => ({ ...by(id), id: t == null ? id : (t ? `${id}_${t + 1}` : id), baseId: id, ...(t == null ? {} : { tgt: t }), ...o });
  // six rounds for the three targets (author, 20 XI): the loading command says so
  const out = STEPS.slice(0, first).map(s => s.id !== "load" ? s : { ...s, baseId: "load", voice: "load_s2", ask: "Komenda: „Sześcioma – magazynki ładuj!”.", action: "Załaduj sześć nabojów do magazynka",
    hint: "Wciskasz naboje kolejno do magazynka, każdy do końca: sześć, po dwa na cel. Kliknij magazynek." });
  const findHint = "Cele leżą na różnych odległościach i kierunkach. Porównaj ich wielkość w lunecie: bliższy gong jest większy.";
  for (const t of T) out.push(mk("scan", t, { voice: t === 0 ? "scan_s2" : `scan_${nr(t)}`, hint: findHint, play: ["s08.cmd"],
    ask: t === 0 ? "Przed tobą trzy gongi. Strzelasz od najbliższego do najdalszego. Znajdź w lunecie najbliższy i najedź na niego krzyżem."
      : `Cel nr ${nr(t)}: następny co do odległości. Znajdź go w lunecie i najedź na niego krzyżem.` }));
  out.push(mk("zoom", 0));
  for (const t of T) {
    out.push(mk("height", t, { voice: `height_s2_${nr(t)}`, ask: `Cel nr ${nr(t)}: odczytaj w siatce wysokość gongu.`, play: ["s09.height"] }));
    out.push(mk("range", t, { voice: `range_s2_${nr(t)}`, ask: `Cel nr ${nr(t)}: oblicz odległość z odczytu wysokości.`, play: t === 2 ? ["s11.formula", "s11.height"] : ["s11.height"],
      hint: "Odległość [m] = wysokość celu 1,0 m × 1000 / odczyt [mil]." }));
  }
  out.push(mk("wind"));
  for (const t of T) out.push(mk("direction", t, { voice: `direction_s2_${nr(t)}`, ask: `Cel nr ${nr(t)}: określ na oko kierunek do migającego celu. Linia pokazuje godzinę 12.` }));
  for (const t of T) out.push(mk("card", t, { voice: `card_s2_${nr(t)}`, ask: `Zaznacz cel nr ${nr(t)} na karcie ognia.`, angleOnly: true, play: t === 2 ? ["s12.card", "s12.target", "s12.weather", "s12.sun"] : ["s12.card"],
    hint: "Liczy się kierunek: środek dołu karty to twoje stanowisko, pionowa oś to godzina 12, jedna godzina to 30°. Odległość na karcie może być przybliżona." }));
  for (const t of T) {
    out.push(mk("parallax", t, { corner: true }));
    out.push(mk("dial", t, { corner: true, voice: `dial_s2_${nr(t)}`, ask: `Cel nr ${nr(t)}: odczytaj z tabel nastawy na jego odległość i wiatr i ustaw je na bębnach.` }));
    if (t === 0) out.push(mk("safety", null, { corner: true }));
    // two shots a target (author, 20 XI): hit only when both hit; then on to the next one either way
    out.push(mk("shot", t, { corner: true, voice: `shot_${nr(t)}`, ask: `Cel nr ${nr(t)}: masz dwa strzały. Cel jest trafiony, gdy oba trafią.`, shots: [0, 1],
      hint: "Patrz na wykres oddechu i strzelaj w pauzie po wydechu. Po pudle popraw nastawy przed drugim strzałem: pocisk wyżej – zmniejsz wysokość, w lewo – poprawka w prawo.",
      stop: { hits: 2, misses: 2 }, last: t === 2, play: t === 2 ? ["s16.group", "s16.empty"] : ["s16.group"] }));
  }
  return out.concat(STEPS.slice(after));
}

// scenario 3 (author, 21 XI; docs/superpowers/specs/2026-11-21-scenario3-sniper-team-design.md): the pair in the forest,
// the instructor on the stand's deck (1.80 m); the trainee is the spotter (finds, measures, reads the wind, works out
// the settings, leads the classic dialogue, judges the shot) and the shooter (fires on "Ognia." when the instructor
// stands). Frames: the scope (s08/s09/s15) and the view from behind the pair (s06.cheek)
export const DIALOG3 = c => [   // the spotter's calls in order; c.call = the settings the trainee worked out
  "Cel — człowiek na trybunie, w narożniku pomostu.",
  `Odległość — ${c.ownRange ?? c.range}.`,
  `Podniesienie — ${fmt(c.call ? c.call.elev : 0)}.`,
  `Wiatr — ${fmt(Math.abs(c.call ? c.call.wind : 0))} ${c.call && c.call.wind < 0 ? "w prawo" : "w lewo"}.`,
  "Obserwator gotowy.",
];
const fmt = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
function scenario3Steps() {
  const by = id => STEPS.find(s => s.id === id);
  return [
    { ...by("scan"), id: "s3_find", baseId: "scan", voice: "s3_find", play: ["s09.why"], ask: "Jesteś obserwatorem. Znajdź w lunecie instruktora na trybunie i najedź na niego krzyżem.",
      hint: "Trybuna jest daleko, za przecinką w lesie. Instruktor chodzi po pomoście i staje w jego narożniku." },
    { ...by("height"), id: "s3_height", baseId: "height", voice: "s3_height", answer: c => 1800 / c.range, tol: 0.2, play: ["s09.height"],
      ask: "Poczekaj, aż instruktor stanie, i odczytaj w siatce jego wysokość.", hint: "Instruktor ma 1,80 m. Postaw kreskę na czubku głowy i policz punkty do stóp." },
    { ...by("range"), id: "s3_range", baseId: "range", voice: "s3_range", hold: { key: "s06.cheek", u: 0.5 }, play: ["s06.cheek"],
      ask: "Oblicz odległość do instruktora.", hint: "Odległość [m] = 1,8 × 1000 / odczyt [mil]." },
    { ...by("wind"), id: "s3_wind", baseId: "wind", voice: "s3_wind", play: ["s10.reading"] },
    { ...by("dial"), id: "s3_dial", baseId: "dial", voice: "s3_dial", hold: { key: "s06.cheek", u: 0.5 }, play: ["s06.cheek"], call: true,
      ask: "Wylicz z tabel nastawy dla strzelca: podniesienie i poprawkę boczną." },
    { id: "s3_dialog", chapter: 13, kind: "sequence", voice: "s3_dialog", hold: { key: "s06.cheek", u: 0.5 }, play: ["s06.cheek"], lines: DIALOG3,
      ask: "Poprowadź dialog: wybieraj kolejne komendy obserwatora. Strzelec odpowiada.",
      hint: "Kolejność: cel, odległość, podniesienie, wiatr, a po „Strzelec gotowy” – „Obserwator gotowy”." },
    { ...by("shot"), id: "s3_shot", baseId: "shot", voice: "s3_shot", shots: [0, 1], stop: { hits: 1, misses: 2 }, whenStopped: true, play: ["s16.group"],
      ask: "Jesteś strzelcem. Strzelasz na komendę „Ognia.”, gdy instruktor stoi.",
      hint: "Gdy instruktor idzie, czekaj. Po „Ognia.” strzelaj w pauzie po wydechu. Po pudle obserwator podaje poprawkę: popraw nastawy." },
    { id: "s3_judge", chapter: 16, kind: "choice", voice: "s3_judge", hold: { key: "s06.cheek", u: 0.5 }, play: ["s06.cheek"],
      options: ["Trafienie.", "Pudło."], correct: c => c.lastHit ? "Trafienie." : "Pudło.",
      ask: "Jesteś znów obserwatorem. Oceń ostatni strzał.", hint: "W lunecie obserwacyjnej widać, czy pocisk doszedł do celu. Gdy instruktor przerwał chodzenie po strzale – trafienie." },
  ];
}

export const ACTION_POOL = [...new Set(STEPS.filter(s => s.kind === "action").map(s => s.action))];
