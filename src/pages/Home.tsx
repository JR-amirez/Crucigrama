import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IonBadge,
  IonButton,
  IonCard,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonPopover,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToast,
  IonToolbar,
} from "@ionic/react";
import {
  alertCircleOutline,
  closeCircleOutline,
  exitOutline,
  homeOutline,
  informationCircleOutline,
  pauseCircleOutline,
  playCircleOutline,
  refresh,
  time,
} from "ionicons/icons";
import "./Home.css";
import { App } from "@capacitor/app";

type Difficulty = "basic" | "intermediate" | "advanced";

export interface PlayProps {
  difficulty?: Difficulty;
}

type ConfettiPiece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
};

type CrucigramaConfigWord = {
  answer?: string;
  clue?: string;
  palabra?: string;
  pista?: string;
};

type CrucigramaRuntimeConfig = {
  nivel?: string;
  autor?: string;
  version?: string;
  fecha?: string;
  descripcion?: string;
  nombreApp?: string;
  plataformas?: string[];
  palabras?: CrucigramaConfigWord[];
  words?: CrucigramaConfigWord[];
};

type Direction = "across" | "down";

type WordDef = {
  answer: string;
  clue: string;
};

type Entry = {
  id: string;
  direction: Direction;
  row: number;
  col: number;
  answer: string;
  clue: string;
};

type Crossword = {
  rows: number;
  cols: number;
  entries: Entry[];
};

type CellStatus = "correct" | "wrong" | "empty";

const BOARD_SIZE_POR_DIFICULTAD: Record<Difficulty, number> = {
  basic: 9,
  intermediate: 12,
  advanced: 15,
};

const keyOf = (r: number, c: number) => `${r}-${c}`;

const getBoardDimensionsForDifficulty = (difficulty: Difficulty) => {
  const size = BOARD_SIZE_POR_DIFICULTAD[difficulty];
  return { rows: size, cols: size };
};

const TIEMPO_POR_DIFICULTAD: Record<Difficulty, number> = {
  basic: 600,
  intermediate: 1200,
  advanced: 1800,
};

const EJERCICIOS_POR_DIFICULTAD: Record<Difficulty, number> = {
  basic: 1,
  intermediate: 1,
  advanced: 1,
};

const PALABRAS_POR_DIFICULTAD: Record<Difficulty, number> = {
  basic: 5,
  intermediate: 10,
  advanced: 15,
};

const PUNTOS_POR_DIFICULTAD: Record<Difficulty, number> = {
  basic: 10,
  intermediate: 15,
  advanced: 20,
};

const normalizeLetter = (raw: string) => {
  const ch = (raw ?? "").slice(-1).toUpperCase();
  if (!ch) return "";
  return /^[A-ZÑÁÉÍÓÚ]$/.test(ch) ? ch : "";
};

const shuffle = <T,>(arr: T[]) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const generateCrossword = (
  words: WordDef[],
  rows: number,
  cols: number,
): Crossword => {
  if (words.length === 0) return { rows, cols, entries: [] };

  const MAX_RESTARTS = 600;

  const makeGrid = () =>
    Array.from(
      { length: rows },
      () =>
        Array.from({ length: cols }, () => ""),
    );

  const inBounds = (
    r: number,
    c: number,
  ) => r >= 0 && r < rows && c >= 0 && c < cols;

  const canPlace = (
    grid: string[][],
    word: string,
    dir: Direction,
    sr: number,
    sc: number,
  ) => {
    const len = word.length;

    const endR = sr + (dir === "down" ? len - 1 : 0);
    const endC = sc + (dir === "across" ? len - 1 : 0);
    if (!inBounds(sr, sc) || !inBounds(endR, endC)) return false;

    if (dir === "across") {
      if (sc - 1 >= 0 && grid[sr][sc - 1]) return false;
      if (sc + len < cols && grid[sr][sc + len]) return false;
    } else {
      if (sr - 1 >= 0 && grid[sr - 1][sc]) return false;
      if (sr + len < rows && grid[sr + len][sc]) return false;
    }

    for (let i = 0; i < len; i++) {
      const r = sr + (dir === "down" ? i : 0);
      const c = sc + (dir === "across" ? i : 0);
      const letter = word[i];
      const existing = grid[r][c];

      if (existing && existing !== letter) return false;

      if (!existing) {
        if (dir === "across") {
          if (r - 1 >= 0 && grid[r - 1][c]) return false;
          if (r + 1 < rows && grid[r + 1][c]) return false;
        } else {
          if (c - 1 >= 0 && grid[r][c - 1]) return false;
          if (c + 1 < cols && grid[r][c + 1]) return false;
        }
      }
    }

    return true;
  };

  const applyPlace = (
    grid: string[][],
    word: string,
    dir: Direction,
    sr: number,
    sc: number,
  ) => {
    for (let i = 0; i < word.length; i++) {
      const r = sr + (dir === "down" ? i : 0);
      const c = sc + (dir === "across" ? i : 0); 
      grid[r][c] = word[i];
    }
  };

  const countOverlaps = (
    grid: string[][],
    word: string,
    dir: Direction,
    sr: number,
    sc: number,
  ) => {
    let overlaps = 0;
    for (let i = 0; i < word.length; i++) {
      const r = sr + (dir === "down" ? i : 0);
      const c = sc + (dir === "across" ? i : 0);
      if (grid[r][c]) overlaps++;
    }
    return overlaps;
  };

  const cloneGrid = (grid: string[][]) => grid.map((row) => row.slice());

  const getCandidatesByCrossing = (
    grid: string[][],
    word: string,
    dir: Direction,
  ) => {
    const candidates: Array<{ r: number; c: number }> = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;

        for (let j = 0; j < word.length; j++) {
          if (word[j] !== cell) continue;

          const sr = dir === "across" ? r : r - j;
          const sc = dir === "across" ? c - j : c;
          candidates.push({ r: sr, c: sc });
        }
      }
    }

    return shuffle(candidates);
  };

  const backtrack = (
    grid: string[][],
    idx: number,
    shuffled: Array<WordDef & { answer: string }>,
    directions: Direction[],
    entries: Entry[],
    acrossCount: number,
    downCount: number,
  ): Entry[] | null => {
    if (idx >= shuffled.length) return entries;

    const w = shuffled[idx];
    const dir = directions[idx];

    const crossingCandidates = getCandidatesByCrossing(grid, w.answer, dir);
    if (crossingCandidates.length === 0) return null;

    for (const cand of crossingCandidates) {
      if (!canPlace(grid, w.answer, dir, cand.r, cand.c)) continue;
      if (countOverlaps(grid, w.answer, dir, cand.r, cand.c) < 1) continue;

      const nextGrid = cloneGrid(grid)
      applyPlace(nextGrid, w.answer, dir, cand.r, cand.c);

      const nextAcross = dir === "across" ? acrossCount + 1 : acrossCount;
      const nextDown = dir === "down" ? downCount + 1 : downCount;

      const prefix = dir === "across" ? "A" : "D";
      const numId = dir === "across" ? nextAcross : nextDown;
      const id = `${prefix}${numId}`;

      const nextEntries = entries.concat({
        id,
        direction: dir,
        row: cand.r,
        col: cand.c,
        answer: w.answer,
        clue: w.clue,
      });

      const res = backtrack(
        nextGrid,
        idx + 1,
        shuffled,
        directions,
        nextEntries,
        nextAcross,
        nextDown,
      );
      if (res) return res;
    }

    return null;
  };

  for (let restart = 0; restart < MAX_RESTARTS; restart++) {
    const grid = makeGrid();

    const shuffled = shuffle(words).map((w) => ({
      ...w,
      answer: w.answer.toUpperCase(),
    }));

    const directions: Direction[] = shuffled.map(
      (
        _,
        i,
      ) => (i % 2 === 0 ? "across" : "down"),
    );

    const first = shuffled[0];
    const firstDir = directions[0];
    const midR = Math.floor(rows / 2);
    const midC = Math.floor(cols / 2);

    const baseR =
      firstDir === "down" 
        ? midR - Math.floor(first.answer.length / 2)
        : midR;

    const baseC =
      firstDir === "across" 
        ? midC - Math.floor(first.answer.length / 2)
        : midC;

    const offsets = [0, -1, 1, -2, 2];
    let built: Crossword | null = null;

    for (const dr of offsets) {
      for (const dc of offsets) {
        const startR0 = baseR + dr;
        const startC0 = baseC + dc;

        if (!canPlace(grid, first.answer, firstDir, startR0, startC0)) continue;

        const g0 = cloneGrid(grid);
        applyPlace(g0, first.answer, firstDir, startR0, startC0);

        const id0 = `${firstDir === "across" ? "A" : "D"}1`;
        const entries0: Entry[] = [
          {
            id: id0,
            direction: firstDir,
            row: startR0,
            col: startC0,
            answer: first.answer,
            clue: first.clue,
          },
        ];

        const across0 = firstDir === "across" ? 1 : 0;
        const down0 = firstDir === "down" ? 1 : 0;

        const res = backtrack(
          g0,
          1,
          shuffled,
          directions,
          entries0,
          across0,
          down0,
        );

        if (res && res.length === words.length) {
          built = { rows, cols, entries: res };
          break;
        }
      }
      if (built) break; 
    }

    if (built) return built;
  }

  return { rows, cols, entries: [] };
}; 

const normalizeConfigAnswer = (answer: string) =>
  answer.toUpperCase().replace(/[^A-Z]/g, "");

const extractWordsFromConfig = (data: CrucigramaRuntimeConfig): WordDef[] => {
  const configuredWords = Array.isArray(data.palabras)
    ? data.palabras
    : Array.isArray(data.words)
      ? data.words
      : [];

  return configuredWords
    .map((item) => {
      const answer = normalizeConfigAnswer(
        String(item.answer ?? item.palabra ?? "").trim(),
      );
      const clue = String(item.clue ?? item.pista ?? "").trim();

      if (!answer || !clue) return null;

      return { answer, clue };
    })
    .filter((item): item is WordDef => item !== null);
};

type CrosswordBuildResult = {
  crossword: Crossword;
  selectedWords: WordDef[];
  usableWords: WordDef[];
  omittedWords: WordDef[];
  requestedWords: number;
  error: string | null;
};

const buildCrosswordForDifficulty = (
  words: WordDef[],
  difficulty: Difficulty,
): CrosswordBuildResult => {
  const { rows, cols } = getBoardDimensionsForDifficulty(difficulty);
  const requestedWords = PALABRAS_POR_DIFICULTAD[difficulty];
  const maxWordLength = Math.max(rows, cols);
  const usableWords = words.filter((w) => w.answer.length <= maxWordLength);
  const omittedWords = words.filter((w) => w.answer.length > maxWordLength);

  if (usableWords.length < requestedWords) {
    return {
      crossword: { rows, cols, entries: [] },
      selectedWords: [],
      usableWords,
      omittedWords,
      requestedWords,
      error: `No hay suficientes palabras para el nivel ${difficulty} (${requestedWords} requeridas).`,
    };
  }

  const MAX_SELECTION_ATTEMPTS = 300;
  for (let attempt = 0; attempt < MAX_SELECTION_ATTEMPTS; attempt++) {
    const selectedWords = shuffle(usableWords).slice(0, requestedWords);
    const crossword = generateCrossword(selectedWords, rows, cols);
    if (crossword.entries.length === requestedWords) {
      return {
        crossword,
        selectedWords,
        usableWords,
        omittedWords,
        requestedWords,
        error: null,
      };
    }
  }

  return {
    crossword: { rows, cols, entries: [] },
    selectedWords: [],
    usableWords,
    omittedWords,
    requestedWords,
    error: `No se pudo construir un crucigrama de ${requestedWords} palabras para el nivel ${difficulty}.`,
  };
};

const Home: React.FC<PlayProps> = ({ difficulty = "intermediate" }) => {
  const initialBoard = getBoardDimensionsForDifficulty(difficulty);
  const [wordPool, setWordPool] = useState<WordDef[]>([]);
  const [crossword, setCrossword] = useState<Crossword>({
    rows: initialBoard.rows,
    cols: initialBoard.cols,
    entries: [],
  });
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, CellStatus>>({});
  const [activeDir, setActiveDir] = useState<Direction>("across");
  const [activeEntryId, setActiveEntryId] = useState<string>("");
  const [toastOpen, setToastOpen] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [showStartScreen, setShowStartScreen] = useState<boolean>(true);
  const [appNombreJuego, setAppNombreJuego] = useState<string>("STEAM-G");
  const [difficultyConfig, setDifficultyConfig] =
    useState<Difficulty>(difficulty);
  const [showInformation, setShowInformation] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(5);
  const [showCountdown, setShowCountdown] = useState<boolean>(false);
  const [appDescripcion, setAppDescripcion] = useState<string>(
    "Juego para el desarrollo de habilidades matemáticas",
  );
  const [appFecha, setAppFecha] = useState<string>("2 de Diciembre del 2025");
  const [appVersion, setAppVersion] = useState<string>("1.0");
  const [appPlataformas, setAppPlataformas] = useState<string>("android");
  const [appAutor, setAppAutor] = useState<string>("Valeria C. Z.");
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const [pausado, setPausado] = useState<boolean>(false);
  const [activeButtonIndex, setActiveButtonIndex] = useState<number | null>(
    null,
  );
  const [isComplete, setisComplete] = useState<boolean>(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [score, setScore] = useState<number>(0);
  const [maxScore, setMaxScore] = useState<number>(0);
  const [completedExercises, setCompletedExercises] = useState<number>(0);
  const [correctWordsTotal, setCorrectWordsTotal] = useState<number>(0);
  const [incorrectWordsTotal, setIncorrectWordsTotal] = useState<number>(0);
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [configLoaded, setConfigLoaded] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const [puntuacionTotal, setPuntuacionTotal] = useState(0);
  const [currentExercise, setCurrentExercise] = useState(1);
  const [showKeepTrying, setShowKeepTrying] = useState<boolean>(false);
  const [showCongrats, setShowCongrats] = useState<boolean>(false);

  const numExercises = EJERCICIOS_POR_DIFICULTAD[difficultyConfig];

  const calculateWordResults = (
    entries: Entry[],
    userLetters: Record<string, string>,
    expectedLetters: Record<string, string>,
  ) => {
    let correctWords = 0;
    for (const entry of entries) {
      let wordIsCorrect = true;
      for (let i = 0; i < entry.answer.length; i++) {
        const r = entry.row + (entry.direction === "down" ? i : 0);
        const c = entry.col + (entry.direction === "across" ? i : 0);
        const k = keyOf(r, c);
        if ((userLetters[k] ?? "").toUpperCase() !== expectedLetters[k]) {
          wordIsCorrect = false;
          break;
        }
      }
      if (wordIsCorrect) correctWords++;
    }

    const totalWords = entries.length;
    return {
      correctWords,
      incorrectWords: Math.max(totalWords - correctWords, 0),
    };
  };

  useEffect(() => {
    setMaxScore(numExercises * PUNTOS_POR_DIFICULTAD[difficultyConfig]);
  }, [numExercises, difficultyConfig]);

  const {
    // aquí sacamos datos listos para dibujar el tablero
    expectedByCell, // letra correcta por celda
    entryCells, // celdas que usa cada palabra
    entriesByCell, // qué palabras pasan por una celda
    cellNumbers, // número de crucigrama por celda de inicio
    blockedSet, // celdas negras (no usadas)
    orderedEntriesAcross, // lista de horizontales ordenada
    orderedEntriesDown, // lista de verticales ordenada
  } = useMemo(() => {
    // se recalcula cuando cambia el crucigrama
    const expected: Record<string, string> = {}; // mapa: celda -> letra correcta
    const eCells: Record<string, string[]> = {}; // mapa: palabra -> lista de celdas
    const eByCell: Record<string, string[]> = {}; // mapa: celda -> ids de palabras

    const markCell = (k: string, entryId: string) => {
      // registra que una palabra pasa por una celda
      if (!eByCell[k]) eByCell[k] = []; // crea arreglo si no existe
      if (!eByCell[k].includes(entryId)) eByCell[k].push(entryId); // mete el id si no estaba
    }; // fin markCell

    for (const entry of crossword.entries) {
      // recorre todas las palabras colocadas
      const cells: string[] = []; // aquí guardamos celdas de esa palabra
      for (let i = 0; i < entry.answer.length; i++) {
        // recorre letras de la palabra
        const r = entry.row + (entry.direction === "down" ? i : 0); // fila de letra
        const c = entry.col + (entry.direction === "across" ? i : 0); // col de letra
        const k = keyOf(r, c); // llave “r-c” para esa celda
        expected[k] = entry.answer[i]; // guarda la letra correcta en esa celda
        cells.push(k); // guarda la celda en la lista de la palabra
        markCell(k, entry.id); // marca que esta palabra usa esa celda
      } // fin for letras
      eCells[entry.id] = cells; // guarda celdas de esa palabra
    } // fin for entries

    const blocks = new Set<string>(); // aquí guardamos celdas negras
    for (let r = 0; r < crossword.rows; r++) {
      // recorre filas del tablero
      for (let c = 0; c < crossword.cols; c++) {
        // recorre cols del tablero
        const k = keyOf(r, c); // llave de celda
        if (!expected[k]) blocks.add(k); // si no hay letra correcta, es celda negra
      } // fin for c
    } // fin for r

    const starts = new Set<string>(); // celdas donde inicia una palabra
    for (const entry of crossword.entries) {
      // recorre palabras
      starts.add(keyOf(entry.row, entry.col)); // guarda su celda inicio
    } // fin for entries

    const numbers: Record<string, number> = {}; // mapa: celda inicio -> número
    let n = 1; // contador de números
    for (let r = 0; r < crossword.rows; r++) {
      // recorre tablero por orden
      for (let c = 0; c < crossword.cols; c++) {
        // recorre tablero por orden
        const k = keyOf(r, c); // llave de celda
        if (starts.has(k)) numbers[k] = n++; // si es inicio, asigna número y suma
      } // fin for c
    } // fin for r

    const numOfEntry = (e: Entry) => numbers[keyOf(e.row, e.col)] ?? 999; // obtiene número de una palabra

    const across = crossword.entries // toma todas las palabras
      .filter((e) => e.direction === "across") // deja solo horizontales
      .slice() // copia para no mutar
      .sort((a, b) => numOfEntry(a) - numOfEntry(b)); // ordena por número

    const down = crossword.entries // toma todas las palabras
      .filter((e) => e.direction === "down") // deja solo verticales
      .slice() // copia para no mutar
      .sort((a, b) => numOfEntry(a) - numOfEntry(b)); // ordena por número

    return {
      // regresa todo listo para dibujar el tablero
      expectedByCell: expected, // letra correcta por celda
      entryCells: eCells, // celdas por palabra
      entriesByCell: eByCell, // palabras por celda
      cellNumbers: numbers, // números del crucigrama
      blockedSet: blocks, // celdas negras
      orderedEntriesAcross: across, // horizontales ordenadas
      orderedEntriesDown: down, // verticales ordenadas
    }; // fin return
  }, [crossword]); // se recalcula cuando cambia el crucigrama

  useEffect(() => {
    setLetters({});
    setStatus({});

    const firstAcross = crossword.entries.find((e) => e.direction === "across");
    const first = firstAcross ?? crossword.entries[0];

    if (first) {
      setActiveDir(first.direction);
      setActiveEntryId(first.id);
    } else {
      setActiveDir("across");
      setActiveEntryId("");
    }
  }, [crossword]);

  useEffect(() => {
    const cargarConfig = async () => {
      try {
        const res = await fetch("/config/crucigrama-config.json");

        if (!res.ok) {
          setConfigError("No se pudo cargar crucigrama-config.json.");
          return;
        }

        const data: CrucigramaRuntimeConfig = await res.json();
        const configDifficulty = data.nivel
          ? normalizarNivelConfig(data.nivel)
          : difficulty;

        if (data.nivel) setDifficultyConfig(configDifficulty);

        if (data.autor) setAppAutor(data.autor);
        if (data.version) setAppVersion(data.version);
        if (data.fecha) setAppFecha(formatearFechaLarga(data.fecha));
        if (data.descripcion) setAppDescripcion(data.descripcion);
        if (data.plataformas) setAppPlataformas(data.plataformas.join(", "));
        if (data.nombreApp) setAppNombreJuego(data.nombreApp);

        const wordsFromConfig = extractWordsFromConfig(data);
        if (wordsFromConfig.length === 0) {
          setConfigError(
            "El archivo crucigrama-config.json no contiene palabras validas.",
          );
          return;
        }

        const buildResult = buildCrosswordForDifficulty(
          wordsFromConfig,
          configDifficulty,
        );
        if (buildResult.omittedWords.length > 0) {
          console.warn(
            "[Crucigrama config] Palabras omitidas por exceder el tamaño del tablero:",
            buildResult.omittedWords.length,
            buildResult.omittedWords,
          );
        }
        console.log(
          "[Crucigrama config] Palabras seleccionadas para el crucigrama:",
          buildResult.selectedWords.length,
          buildResult.selectedWords,
        );

        if (buildResult.error) {
          setWordPool([]);
          setConfigError(buildResult.error);
          return;
        }

        setWordPool(buildResult.usableWords);
        setCrossword(buildResult.crossword);
        setConfigError(null);
      } catch (err) {
        console.error("No se pudo cargar crucigrama-config.json", err);
        setConfigError("No se pudo cargar crucigrama-config.json.");
      } finally {
        setConfigLoaded(true);
      }
    };

    cargarConfig();
  }, []);

  useEffect(() => {
    if (showCountdown && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (showCountdown && countdown === 0) {
      setTimeout(() => {
        setShowCountdown(false);
      }, 500);
    }
  }, [countdown, showCountdown]);

  useEffect(() => {
    const keys = Object.keys(expectedByCell);
    if (keys.length === 0) return;

    // Verificar si todas las celdas están llenas
    const allFilled = keys.every((k) => (letters[k] ?? "").trim() !== "");

    if (!allFilled) {
      // Si no están todas llenas, limpiar el estado de validación
      setStatus({});
      validationHandledRef.current = false;
      return;
    }

    // Verificar si todas las respuestas son correctas
    const allCorrect = keys.every(
      (k) => (letters[k] ?? "").toUpperCase() === expectedByCell[k],
    );

    if (allCorrect) {
      // Evitar validación múltiple solo para el caso correcto
      if (validationHandledRef.current) return;
      validationHandledRef.current = true;

      // Crucigrama correcto: mostrar felicitaciones y sumar puntos
      const pointsWon = PUNTOS_POR_DIFICULTAD[difficultyConfig];
      const totalWords = crossword.entries.length;
      setShowCongrats(true);
      setPuntuacionTotal((prev) => prev + pointsWon);
      setScore((prev) => prev + pointsWon);

      // Después de 2 segundos, pasar al siguiente ejercicio
      setTimeout(() => {
        setShowCongrats(false);
        goToNextExercise({ correctWords: totalWords, incorrectWords: 0 });
      }, 2000);
    } else {
      // Crucigrama incorrecto: pintar celdas incorrectas de rojo
      const newStatus: Record<string, CellStatus> = {};
      for (const k of keys) {
        const user = (letters[k] ?? "").toUpperCase();
        const expected = expectedByCell[k];
        newStatus[k] = user === expected ? "correct" : "wrong";
      }
      setStatus(newStatus);
    }
  }, [letters, expectedByCell]);

  // Refs para acceder a valores actuales sin re-ejecutar el efecto
  const expectedByCellRef = useRef(expectedByCell);
  const crosswordEntriesRef = useRef(crossword.entries);
  const lettersRef = useRef(letters);
  const currentExerciseRef = useRef(currentExercise);
  const timeoutHandledRef = useRef(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const validationHandledRef = useRef(false);

  useEffect(() => {
    expectedByCellRef.current = expectedByCell;
  }, [expectedByCell]);

  useEffect(() => {
    crosswordEntriesRef.current = crossword.entries;
  }, [crossword.entries]);

  useEffect(() => {
    lettersRef.current = letters;
  }, [letters]);

  useEffect(() => {
    currentExerciseRef.current = currentExercise;
  }, [currentExercise]);

  // Función para pasar al siguiente ejercicio
  const goToNextExercise = (result: {
    correctWords: number;
    incorrectWords: number;
  }) => {
    setCompletedExercises((prev) => prev + 1);
    setCorrectWordsTotal((prev) => prev + result.correctWords);
    setIncorrectWordsTotal((prev) => prev + result.incorrectWords);

    if (currentExerciseRef.current < numExercises) {
      setCurrentExercise(currentExerciseRef.current + 1);
      const nextBuild = buildCrosswordForDifficulty(wordPool, difficultyConfig);
      if (!nextBuild.error) {
        setCrossword(nextBuild.crossword);
        setConfigError(null);
      } else {
        console.error("[Crucigrama] No se pudo generar el siguiente crucigrama.");
        setConfigError(nextBuild.error);
      }
      setTiempoRestante(TIEMPO_POR_DIFICULTAD[difficultyConfig]);
      timeoutHandledRef.current = false;
      validationHandledRef.current = false;
    } else {
      setShowSummary(true);
    }
  };

  // Temporizador principal del juego
  useEffect(() => {
    // No correr si estamos en pantalla de inicio, countdown, pausado, o mostrando overlays
    const shouldPause =
      showStartScreen ||
      showCountdown ||
      pausado ||
      showSummary ||
      showFeedback ||
      showKeepTrying ||
      showCongrats ||
      countdown > 0;

    if (shouldPause) return;
    if (tiempoRestante <= 0) return;

    const timer = setTimeout(() => {
      setTiempoRestante((prev) => {
        if (prev <= 0) return 0;

        const newTime = prev - 1;

        if (newTime === 0 && !timeoutHandledRef.current) {
          timeoutHandledRef.current = true;

          // Verificar si el crucigrama está completo
          const keys = Object.keys(expectedByCellRef.current);
          const isComplete =
            keys.length > 0 &&
            keys.every(
              (k) =>
                (lettersRef.current[k] ?? "").toUpperCase() ===
                expectedByCellRef.current[k],
            );

          if (!isComplete) {
            // Mostrar overlay "Sigue intentando"
            setShowKeepTrying(true);
            // Limpiar timeout anterior si existe
            if (transitionTimeoutRef.current) {
              clearTimeout(transitionTimeoutRef.current);
            }
            const wordResults = calculateWordResults(
              crosswordEntriesRef.current,
              lettersRef.current,
              expectedByCellRef.current,
            );
            transitionTimeoutRef.current = setTimeout(() => {
              setShowKeepTrying(false);
              goToNextExercise(wordResults);
            }, 2000);
          }
        }
        return newTime;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    showStartScreen,
    showCountdown,
    pausado,
    showSummary,
    showFeedback,
    showKeepTrying,
    showCongrats,
    countdown,
    tiempoRestante,
    numExercises,
    difficultyConfig,
  ]);

  // Limpiar timeout de transición cuando el componente se desmonte
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const activeEntry = useMemo(
    () => crossword.entries.find((e) => e.id === activeEntryId),
    [activeEntryId, crossword.entries],
  );

  const activeCells = useMemo(
    () => (activeEntry ? (entryCells[activeEntry.id] ?? []) : []),
    [activeEntry, entryCells],
  );

  const focusCell = (k: string) => {
    const el = inputRefs.current[k];
    if (el) el.focus();
  };

  const setCellLetter = (k: string, value: string) => {
    setLetters((prev) => ({ ...prev, [k]: value }));
  };

  const handleCellClick = (k: string, shouldFocus = true) => {
    if (blockedSet.has(k)) return;

    const ids = entriesByCell[k] ?? [];
    if (ids.length === 0) return;

    const preferredId = ids.find(
      (id) =>
        crossword.entries.find((e) => e.id === id)?.direction === activeDir,
    );
    const pickedId = preferredId ?? ids[0];

    const picked = crossword.entries.find((e) => e.id === pickedId);
    if (!picked) return;

    setActiveDir(picked.direction);
    setActiveEntryId(picked.id);

    if (shouldFocus) focusCell(k);
  };

  const firstCellToFocusInEntry = (entryId: string) => {
    const cells = entryCells[entryId] ?? [];
    if (!cells.length) return null;

    for (const k of cells) {
      const filled = (letters[k] ?? "") !== "";
      if (filled && isCrossingCell(k)) continue;
      return k;
    }
    return cells[0];
  };

  const isCrossingCell = (cellKey: string) =>
    (entriesByCell[cellKey]?.length ?? 0) > 1;

  const nextCellSkippingPrefilledCrossings = (
    fromKey: string,
    snapshotLetters: Record<string, string>,
  ) => {
    const idx = activeCells.indexOf(fromKey);
    if (idx < 0) return null;

    for (let i = idx + 1; i < activeCells.length; i++) {
      const k2 = activeCells[i];
      const filled = (snapshotLetters[k2] ?? "") !== "";

      if (filled && isCrossingCell(k2)) continue;

      return k2;
    }
    return null;
  };

  const handleInput = (k: string, raw: string) => {
    const v = normalizeLetter(raw);
    setCellLetter(k, v);

    if (!v) return;

    const snapshot = { ...letters, [k]: v };

    const next = nextCellSkippingPrefilledCrossings(k, snapshot);
    if (next) focusCell(next);
  };

  const handleKeyDown = (
    k: string,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== "Backspace") return;

    const current = letters[k] ?? "";
    const idx = activeCells.indexOf(k);

    if (current) {
      e.preventDefault();
      setCellLetter(k, "");
      return;
    }

    if (idx > 0) {
      e.preventDefault();
      const prev = activeCells[idx - 1];
      setCellLetter(prev, "");
      requestAnimationFrame(() => focusCell(prev));
    }
  };

  const getDifficultyLabel = (nivel: Difficulty): string => {
    const labels: Record<Difficulty, string> = {
      basic: "Básico",
      intermediate: "Intermedio",
      advanced: "Avanzado",
    };
    return labels[nivel] ?? nivel;
  };

  const generarConfeti = (cantidad = 60): ConfettiPiece[] => {
    const colores = ["#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1", "#5f27cd"];

    return Array.from({ length: cantidad }, (_, id) => ({
      id,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2.5,
      color: colores[Math.floor(Math.random() * colores.length)],
    }));
  };

  const formatPlataforma = (texto: string): string => {
    const mapa: Record<string, string> = {
      android: "Android",
      ios: "iOS",
      web: "Web",
    };
    return texto
      .split(/,\s*/)
      .map(
        (p) => mapa[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1),
      )
      .join(", ");
  };

  const normalizarNivelConfig = (nivel: string): Difficulty => {
    const limpio = nivel.toLowerCase();
    const mapa: Record<string, Difficulty> = {
      basico: "basic",
      basic: "basic",
      intermedio: "intermediate",
      intermediate: "intermediate",
      avanzado: "advanced",
      advanced: "advanced",
    };
    return mapa[limpio] ?? "basic";
  };

  const formatearFechaLarga = (isoDate?: string) => {
    if (!isoDate) return appFecha;
    const [year, month, day] = isoDate.split("-");
    const meses = [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ];

    const mesIndex = Number(month) - 1;
    if (mesIndex < 0 || mesIndex > 11) return isoDate;

    return `${Number(day)} de ${meses[mesIndex]} del ${year}`;
  };

  const formatearTiempo = (segundos: number) => {
    const minutos = Math.floor(segundos / 60);
    const segs = Math.max(0, segundos % 60);
    return `${minutos}:${segs.toString().padStart(2, "0")}`;
  };

  const handleSalirDesdePausa = () => {
    setPausado(false);
    handleExitToStart();
  };

  const handleExitApp = async () => {
    try {
      await App.exitApp();
    } catch (e) {
      window.close();
    }
  };

  const handleStartGame = () => {
    if (!configLoaded || wordPool.length === 0) return;

    setShowStartScreen(false);
    resetGame();
  };

  const handleInformation = () => {
    setShowInformation(!showInformation);
  };

  const handlePausar = () => {
    if (
      showStartScreen ||
      showCountdown ||
      showSummary ||
      showInstructions ||
      showFeedback ||
      pausado
    )
      return;

    setPausado(true);
  };

  const handleResume = () => {
    setShowExitModal(false);
    setPausado(false);
  };

  const handleExitToStart = () => {
    setShowExitModal(false);
    setShowCountdown(false);
    setShowInstructions(false);
    setShowSummary(false);
    setShowFeedback(false);

    setShowStartScreen(true);
  };

  const resetGame = () => {
    setCountdown(5);
    setShowCountdown(true);
    setActiveButtonIndex(null);
    setisComplete(true);
    setScore(0);
    setMaxScore(numExercises * PUNTOS_POR_DIFICULTAD[difficultyConfig]);
    setPuntuacionTotal(0);
    setCompletedExercises(0);
    setCorrectWordsTotal(0);
    setIncorrectWordsTotal(0);
    setTiempoRestante(TIEMPO_POR_DIFICULTAD[difficultyConfig]);
    setCurrentExercise(1);
    const resetBuild = buildCrosswordForDifficulty(wordPool, difficultyConfig);
    if (!resetBuild.error) {
      setCrossword(resetBuild.crossword);
      setConfigError(null);
    } else {
      console.error("[Crucigrama] No se pudo reiniciar el crucigrama.");
      setConfigError(resetBuild.error);
    }
    timeoutHandledRef.current = false;
    validationHandledRef.current = false;
  };

  const clues =
    activeDir === "across" ? orderedEntriesAcross : orderedEntriesDown;
  const entryNumber = (e: Entry) => cellNumbers[keyOf(e.row, e.col)] ?? 0;

  return (
    <IonPage>
      {showCountdown && countdown > 0 && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdown}</div>
        </div>
      )}

      {showFeedback && (
        <div className="feedback-overlay">
          <div className="feedback-text">{feedbackMessage}</div>
        </div>
      )}

      {showKeepTrying && (
        <div className="keep-trying-overlay">
          <div className="keep-trying-content">
            <div className="keep-trying-emoji">💪</div>
            <div className="keep-trying-text">¡Sigue intentando!</div>
          </div>
        </div>
      )}

      {showCongrats && (
        <div className="congrats-overlay">
          <div className="congrats-content">
            <div className="congrats-emoji">🎉</div>
            <div className="congrats-text">¡Felicidades!</div>
            <div className="congrats-points">
              +{PUNTOS_POR_DIFICULTAD[difficultyConfig]} puntos
            </div>
          </div>
          <div className="confetti-container">
            {generarConfeti().map((c) => (
              <div
                key={c.id}
                className="confetti"
                style={{
                  left: `${c.left}%`,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.duration}s`,
                  backgroundColor: c.color,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showSummary && (
        <div className="summary-overlay">
          <div className="summary-message">
            {(() => {
              const totalEjercicios = completedExercises;
              const correctas = correctWordsTotal;
              const incorrectas = incorrectWordsTotal;
              const totalPalabras = correctas + incorrectas;
              const porcentaje =
                totalPalabras > 0
                  ? Math.round((correctas / totalPalabras) * 100)
                  : 0;
              const etiqueta =
                totalPalabras > 0 && incorrectas === 0
                  ? "¡PERFECTO! 🏆"
                  : porcentaje >= 70
                    ? "¡Excelente! 🔥"
                    : porcentaje >= 50
                      ? "¡Buen trabajo! 👍"
                      : "¡Sigue practicando! 💪";

              return (
                <>
                  <h2>Juego Terminado</h2>

                  <div className="resumen-final">
                    <h3>Resultados Finales</h3>
                    <p>
                      <strong>Palabras correctas:</strong> {correctas}
                    </p>
                    <p>
                      <strong>Palabras incorrectas:</strong> {incorrectas}
                    </p>
                    <p>
                      <strong>Puntuación total:</strong> {score} / {maxScore}
                    </p>

                    <IonBadge className="badge">{etiqueta}</IonBadge>
                  </div>

                  <IonButton
                    id="finalize"
                    expand="block"
                    onClick={handleSalirDesdePausa}
                  >
                    <IonIcon icon={refresh} slot="start" />
                    Jugar de Nuevo
                  </IonButton>

                  <IonButton id="exit" expand="block" onClick={handleExitApp}>
                    <IonIcon slot="start" icon={exitOutline}></IonIcon>
                    Cerrar aplicación
                  </IonButton>
                </>
              );
            })()}
          </div>

          <div className="confetti-container">
            {generarConfeti().map((c) => (
              <div
                key={c.id}
                className="confetti"
                style={{
                  left: `${c.left}%`,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.duration}s`,
                  backgroundColor: c.color,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="ins-overlay" onClick={() => setShowInstructions(false)}>
          <div className="ins-card" onClick={(e) => e.stopPropagation()}>
            <div className="ins-title">
              <h2
                style={{ margin: 0, fontWeight: "bold", color: "var(--dark)" }}
              >
                Reglas Básicas
              </h2>
              <IonIcon
                icon={closeCircleOutline}
                style={{ fontSize: "26px", color: "var(--dark)" }}
                onClick={() => setShowInstructions(false)}
              />
            </div>

            <div className="ins-stats">
              <p style={{ textAlign: "justify" }}>
                <strong>
                  Descifra las pistas horizontales y verticales para completar el crucigrama.
                </strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {showInformation && (
        <div className="info-modal-background">
          <div className="info-modal">
            <div className="header">
              <h2 style={{ color: "var(--color-primary)", fontWeight: "bold" }}>
                {appNombreJuego}
              </h2>
              <p
                style={{
                  color: "#8b8b8bff",
                  marginTop: "5px",
                  textAlign: "center",
                }}
              >
                Actividad configurada desde la plataforma Steam-G
              </p>
            </div>
            <div className="cards-info">
              <div className="card">
                <p className="title">VERSIÓN</p>
                <p className="data">{appVersion}</p>
              </div>
              <div className="card">
                <p className="title">FECHA DE CREACIÓN</p>
                <p className="data">{appFecha}</p>
              </div>
              <div className="card">
                <p className="title">PLATAFORMAS</p>
                <p className="data">{formatPlataforma(appPlataformas)}</p>
              </div>
              <div className="card">
                <p className="title">NÚMERO DE EJERCICIOS</p>
                <p className="data">{numExercises}</p>
              </div>
              <div className="card description">
                <p className="title">DESCRIPCIÓN</p>
                <p className="data">{appDescripcion}</p>
              </div>
            </div>
            <div className="button">
              <IonButton expand="full" onClick={handleInformation}>
                Cerrar
              </IonButton>
            </div>
          </div>
        </div>
      )}

      {pausado && (
        <div className="pause-overlay">
          <div className="pause-card">
            <h2>Juego en pausa</h2>
            <p>El tiempo está detenido.</p>

            <IonButton
              expand="block"
              id="resume"
              style={{ marginTop: "16px" }}
              onClick={handleResume}
            >
              <IonIcon slot="start" icon={playCircleOutline}></IonIcon>
              Reanudar
            </IonButton>

            <IonButton
              expand="block"
              id="finalize"
              style={{ marginTop: "10px" }}
              onClick={handleSalirDesdePausa}
            >
              <IonIcon slot="start" icon={homeOutline}></IonIcon>
              Finalizar juego
            </IonButton>

            <IonButton
              expand="block"
              id="exit"
              style={{ marginTop: "10px" }}
              onClick={handleExitApp}
            >
              <IonIcon slot="start" icon={exitOutline}></IonIcon>
              Cerrar aplicación
            </IonButton>
          </div>
        </div>
      )}

      <IonContent fullscreen>
        {showStartScreen ? (
          <div className="inicio-container">
            <div className="header-game ion-no-border">
              <div className="toolbar-game">
                <div className="titles start-page">
                  <h1>{appNombreJuego}</h1>
                </div>
              </div>
            </div>

            <div className="info-juego">
              <div className="info-item">
                <IonChip>
                  <strong>Nivel: {getDifficultyLabel(difficultyConfig)}</strong>
                </IonChip>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
              className="page-start-btns"
            >
              <IonButton
                onClick={handleStartGame}
                className="play"
                disabled={!configLoaded || wordPool.length === 0}
              >
                <IonIcon slot="start" icon={playCircleOutline}></IonIcon>
                Iniciar juego
              </IonButton>
              <IonButton onClick={handleInformation} className="info">
                <IonIcon slot="start" icon={informationCircleOutline}></IonIcon>
                Información
              </IonButton>
            </div>
          </div>
        ) : (
          <>
            <div className="header-game ion-no-border">
              <div className="toolbar-game">
                <div className="titles">
                  <h1>STEAM-G</h1>
                  <IonIcon
                    icon={alertCircleOutline}
                    size="small"
                    id="info-icon"
                  />
                  <IonPopover
                    trigger="info-icon"
                    side="bottom"
                    alignment="center"
                  >
                    <IonCard className="filter-card ion-no-margin">
                      <div className="section header-section">
                        <h2>{appNombreJuego}</h2>
                      </div>

                      <div className="section description-section">
                        <p>{appDescripcion}</p>
                      </div>

                      <div className="section footer-section">
                        <span>{appFecha}</span>
                      </div>
                    </IonCard>
                  </IonPopover>
                </div>
                <span>
                  <strong>{appNombreJuego}</strong>
                </span>
              </div>
            </div>

            <div className="instructions-exercises">
              <div className="num-words rules" onClick={() => setShowInstructions(true)}>
                Reglas Básicas
              </div>

              <div className="temporizador">
                <IonIcon icon={time} className="icono-tiempo" />
                <h5 className="tiempo-display">
                  {formatearTiempo(tiempoRestante)}
                </h5>
              </div>

              <div className="num-words">
                <strong>Puntuación: {puntuacionTotal}</strong>
              </div>
              
            </div>

            <div className="videogame">
              <div className="cw-board"
                style={{
                  gridTemplateColumns: `repeat(${crossword.cols}, 1fr)`,
                }}
              >
                {" "}
                {/* define columnas del tablero */}
                {Array.from({ length: crossword.rows * crossword.cols }).map(
                  (_, idx) => {
                    const r = Math.floor(idx / crossword.cols); // calcula fila de la celda
                    const c = idx % crossword.cols; // calcula col de la celda
                    const k = keyOf(r, c); // crea llave única “r-c”

                    const blocked = blockedSet.has(k); // true si es celda negra
                    const isActive = activeCells.includes(k); // true si es celda de la palabra activa
                    const st = status[k]; // estado visual (correct/wrong/empty)
                    const num = cellNumbers[k]; // número si aquí inicia palabra

                    if (blocked)
                      return <div key={k} className="cw-cell blocked" />; // si es negra, solo pinta bloque

                    return (
                      // si no es negra, pinta celda editable
                      <div
                        key={k} // key de React
                        className={[
                          // clases para estilos del tablero
                          "cw-cell", // clase base
                          isActive ? "active" : "", // resalta si es palabra activa
                          st ? st : "", // pinta correcto/incorrecto
                        ].join(" ")} // une clases en un string
                        onClick={() => handleCellClick(k)} // al click, activa palabra de esa celda
                      >
                        {num ? <span className="cw-number">{num}</span> : null}{" "}
                        {/* muestra numerito si aplica */}
                        <input
                          ref={(el) => {
                            inputRefs.current[k] = el;
                          }} // guarda referencia del input por celda
                          value={letters[k] ?? ""} // muestra la letra capturada por el usuario
                          maxLength={1} // solo 1 letra por celda
                          inputMode="text" // teclado tipo texto
                          onFocus={(e) => {
                            // cuando el usuario entra a la celda
                            handleCellClick(k, false); // activa palabra, sin mover el foco otra vez
                            e.currentTarget.select(); // selecciona letra para sobreescribir fácil
                          }} // fin onFocus
                          onKeyDown={(e) => handleKeyDown(k, e)} // controla backspace dentro de la palabra
                          onChange={(e) => handleInput(k, e.target.value)} // guarda letra y avanza a la siguiente celda
                        />{" "}
                        {/* fin input */}
                      </div> // fin celda
                    ); // fin return celda editable
                  },
                )}
              </div>

              <div className="cw-panel">

                <IonSegment
                  value={activeDir}
                  onIonChange={(e) => {
                    const dir = (e.detail.value as Direction) ?? "across";
                    setActiveDir(dir);

                    const list =
                      dir === "across"
                        ? orderedEntriesAcross
                        : orderedEntriesDown;
                    if (list[0]) setActiveEntryId(list[0].id);
                  }}
                >
                  <IonSegmentButton value="down">
                    <IonLabel>Verticales</IonLabel>
                  </IonSegmentButton>
                  <IonSegmentButton value="across">
                    <IonLabel>Horizontales</IonLabel>
                  </IonSegmentButton>
                </IonSegment>

                <IonList>
                  {clues.map((e) => (
                    <IonItem
                      key={e.id}
                      button
                      className={e.id === activeEntryId ? "clue-active" : ""}
                      onClick={() => {
                        setActiveDir(e.direction);
                        setActiveEntryId(e.id);

                        const kStart = firstCellToFocusInEntry(e.id);
                        if (kStart) focusCell(kStart);
                      }}
                    >
                      <IonLabel style={{ fontSize: "0.9rem" }}>
                        <strong>{entryNumber(e)}.</strong> {e.clue}
                      </IonLabel>
                    </IonItem>
                  ))}
                </IonList>
              </div>
            </div>

            <div className="button game">
              <IonButton
                shape="round"
                expand="full"
                onClick={handlePausar}
                disabled={
                  showCountdown ||
                  showFeedback ||
                  showSummary ||
                  showInstructions ||
                  pausado ||
                  activeButtonIndex !== null ||
                  !isComplete
                }
              >
                <IonIcon slot="start" icon={pauseCircleOutline} />
                Pausar
              </IonButton>
            </div>
          </>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Home;
