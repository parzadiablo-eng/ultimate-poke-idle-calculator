import { useEffect, useMemo, useState } from "react";

type Stats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
type Move = { name: string; type: string; cat: string; pow: number; acc: number; pp: number; desc: string };
type Mon = {
  dex: number; slug: string; name: string; types: string[]; base: Stats;
  abilities: string[]; levelMoves: { lv: number; slug: string }[]; tmMoves: string[];
};
type BossMon = { slug: string; name: string; level: number; ace?: boolean; moves: { name: string; type: string }[] };
type Boss = { id: string; leader?: string; name: string; city?: string; type?: string; team: BossMon[] };
type Slot = { slug: string; level: number; ivs: Stats; nature: string };
type Recommendation = { move: Move; score: number; source: string };
type StatKey = keyof Stats;
type BuildPlan = {
  role: string;
  summary: string;
  priorities: { key: StatKey; label: string; points: number; reason: string }[];
  avoid: string;
  basis: string;
};
type LevelZone = { minLevel: number; maxLevel: number; area?: string; label?: string };
type GameMap = { id: string; name: string; levelZones?: LevelZone[] };
type TrainingZone = { name: string; min: number; max: number; area?: string };
type Encounter = { slug: string; dex: number; name: string; min: number; max: number; pct?: number; time?: string };
type CatchOption = {
  mon: Mon; route: string; method: string; min: number; max: number; chance?: number;
  score: number; strongTypes: string[]; role: string;
};
type Nature = { name: string; up: StatKey | null; down: StatKey | null };

const TYPE_CHART: Record<string, Record<string, number>> = {
  Normal: { Rock: .5, Ghost: 0, Steel: .5 },
  Fire: { Fire: .5, Water: .5, Grass: 2, Ice: 2, Bug: 2, Rock: .5, Dragon: .5, Steel: 2 },
  Water: { Fire: 2, Water: .5, Grass: .5, Ground: 2, Rock: 2, Dragon: .5 },
  Electric: { Water: 2, Electric: .5, Grass: .5, Ground: 0, Flying: 2, Dragon: .5 },
  Grass: { Fire: .5, Water: 2, Grass: .5, Poison: .5, Ground: 2, Flying: .5, Bug: .5, Rock: 2, Dragon: .5, Steel: .5 },
  Ice: { Fire: .5, Water: .5, Grass: 2, Ice: .5, Ground: 2, Flying: 2, Dragon: 2, Steel: .5 },
  Fighting: { Normal: 2, Ice: 2, Poison: .5, Flying: .5, Psychic: .5, Bug: .5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: .5 },
  Poison: { Grass: 2, Poison: .5, Ground: .5, Rock: .5, Ghost: .5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: .5, Poison: 2, Flying: 0, Bug: .5, Rock: 2, Steel: 2 },
  Flying: { Electric: .5, Grass: 2, Fighting: 2, Bug: 2, Rock: .5, Steel: .5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: .5, Dark: 0, Steel: .5 },
  Bug: { Fire: .5, Grass: 2, Fighting: .5, Poison: .5, Flying: .5, Psychic: 2, Ghost: .5, Dark: 2, Steel: .5, Fairy: .5 },
  Rock: { Fire: 2, Ice: 2, Fighting: .5, Ground: .5, Flying: 2, Bug: 2, Steel: .5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: .5 },
  Dragon: { Dragon: 2, Steel: .5, Fairy: 0 },
  Dark: { Fighting: .5, Psychic: 2, Ghost: 2, Dark: .5, Fairy: .5 },
  Steel: { Fire: .5, Water: .5, Electric: .5, Ice: 2, Rock: 2, Steel: .5, Fairy: 2 },
  Fairy: { Fire: .5, Fighting: 2, Poison: .5, Dragon: 2, Dark: 2, Steel: .5 },
};

const DEFAULT_IVS: Stats = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
const EMPTY_TEAM: Slot[] = Array.from({ length: 6 }, () => ({ slug: "", level: 100, ivs: { ...DEFAULT_IVS }, nature: "Hardy" }));
const SAVED_TEAM_KEY = "upi-calculator-team";
const freshTeam = (): Slot[] => EMPTY_TEAM.map(slot => ({ ...slot, ivs: { ...slot.ivs } }));
const loadSavedSetup = (): { team: Slot[]; pokemonSearch: string[] } => {
  const fallback = { team: freshTeam(), pokemonSearch: Array(6).fill("") as string[] };
  try {
    const raw = localStorage.getItem(SAVED_TEAM_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { team?: Partial<Slot>[]; pokemonSearch?: unknown[] };
    if (!Array.isArray(saved.team)) return fallback;
    const team = Array.from({ length: 6 }, (_, index): Slot => {
      const slot = saved.team?.[index];
      const ivs = slot?.ivs as Partial<Stats> | undefined;
      const clampIv = (value: unknown) => Math.max(0, Math.min(31, Number(value) || 0));
      return {
        slug: typeof slot?.slug === "string" ? slot.slug : "",
        level: Math.max(1, Math.min(1000, Number(slot?.level) || 100)),
        nature: typeof slot?.nature === "string" ? slot.nature : "Hardy",
        ivs: {
          hp: clampIv(ivs?.hp ?? 15),
          atk: clampIv(ivs?.atk ?? 15),
          def: clampIv(ivs?.def ?? 15),
          spa: clampIv(ivs?.spa ?? 15),
          spd: clampIv(ivs?.spd ?? 15),
          spe: clampIv(ivs?.spe ?? 15),
        },
      };
    });
    const pokemonSearch = Array.from({ length: 6 }, (_, index) => {
      const name = saved.pokemonSearch?.[index];
      return typeof name === "string" ? name : "";
    });
    return { team, pokemonSearch };
  } catch {
    return fallback;
  }
};
const STAT_LABELS: Record<StatKey, string> = {
  hp: "HP", atk: "Ataque", def: "Defesa", spa: "At. Especial", spd: "Def. Especial", spe: "Velocidade",
};
const NATURES: Nature[] = [
  { name: "Hardy", up: null, down: null },
  { name: "Lonely", up: "atk", down: "def" },
  { name: "Brave", up: "atk", down: "spe" },
  { name: "Adamant", up: "atk", down: "spa" },
  { name: "Naughty", up: "atk", down: "spd" },
  { name: "Bold", up: "def", down: "atk" },
  { name: "Docile", up: null, down: null },
  { name: "Relaxed", up: "def", down: "spe" },
  { name: "Impish", up: "def", down: "spa" },
  { name: "Lax", up: "def", down: "spd" },
  { name: "Timid", up: "spe", down: "atk" },
  { name: "Hasty", up: "spe", down: "def" },
  { name: "Serious", up: null, down: null },
  { name: "Jolly", up: "spe", down: "spa" },
  { name: "Naive", up: "spe", down: "spd" },
  { name: "Modest", up: "spa", down: "atk" },
  { name: "Mild", up: "spa", down: "def" },
  { name: "Quiet", up: "spa", down: "spe" },
  { name: "Bashful", up: null, down: null },
  { name: "Rash", up: "spa", down: "spd" },
  { name: "Calm", up: "spd", down: "atk" },
  { name: "Gentle", up: "spd", down: "def" },
  { name: "Sassy", up: "spd", down: "spe" },
  { name: "Careful", up: "spd", down: "spa" },
  { name: "Quirky", up: null, down: null },
];
const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const effectiveness = (attackType: string, defenderTypes: string[]) =>
  defenderTypes.reduce((value, type) => value * (TYPE_CHART[attackType]?.[type] ?? 1), 1);
const calculateStat = (base: number, iv: number, ev: number, level: number, hp = false) => {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  return hp ? core + level + 10 : core + 5;
};
const projectedStats = (mon: Mon, level: number, ivs: Stats, evs: Partial<Stats> = {}, nature?: Nature): Stats => {
  const natureValue = (stat: StatKey, value: number) =>
    Math.floor(value * (nature?.up === stat ? 1.1 : nature?.down === stat ? .9 : 1));
  return ({
  hp: calculateStat(mon.base.hp, ivs.hp, evs.hp ?? 0, level, true),
  atk: natureValue("atk", calculateStat(mon.base.atk, ivs.atk, evs.atk ?? 0, level)),
  def: natureValue("def", calculateStat(mon.base.def, ivs.def, evs.def ?? 0, level)),
  spa: natureValue("spa", calculateStat(mon.base.spa, ivs.spa, evs.spa ?? 0, level)),
  spd: natureValue("spd", calculateStat(mon.base.spd, ivs.spd, evs.spd ?? 0, level)),
  spe: natureValue("spe", calculateStat(mon.base.spe, ivs.spe, evs.spe ?? 0, level)),
  });
};
const natureDescription = (nature: Nature) => nature.up && nature.down
  ? `+10% ${STAT_LABELS[nature.up]} · −10% ${STAT_LABELS[nature.down]}`
  : "Nature neutra";

function PokemonSprite({ dex, name, className = "" }: { dex: number; name: string; className?: string }) {
  const [fallback, setFallback] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setFallback(false);
    setHidden(false);
  }, [dex]);
  if (hidden) return null;
  const root = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
  const animated = `${root}/versions/generation-v/black-white/animated/${dex}.gif`;
  const still = `${root}/${dex}.png`;
  return <img
    className={`pokemonSprite ${className}`}
    src={fallback ? still : animated}
    alt={`Sprite de ${name}`}
    width="96"
    height="96"
    loading="lazy"
    onError={() => fallback ? setHidden(true) : setFallback(true)}
  />;
}

export default function Home() {
  const [mons, setMons] = useState<Mon[]>([]);
  const [moves, setMoves] = useState<Record<string, Move>>({});
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [maps, setMaps] = useState<GameMap[]>([]);
  const [bossId, setBossId] = useState("");
  const [team, setTeam] = useState<Slot[]>(() => loadSavedSetup().team);
  const [pokemonSearch, setPokemonSearch] = useState<string[]>(() => loadSavedSetup().pokemonSearch);
  const [analyzed, setAnalyzed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"battle" | "beginner" | "tutorial">("battle");
  const [starterSearch, setStarterSearch] = useState("");
  const [starterSlug, setStarterSlug] = useState("");
  const [guideGymId, setGuideGymId] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem("upi-calculator-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("upi-calculator-theme", theme);
    } catch {
      // Mantém o tema ativo mesmo quando o armazenamento está bloqueado.
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_TEAM_KEY, JSON.stringify({ team, pokemonSearch }));
    } catch {
      // A calculadora continua funcionando quando o armazenamento está bloqueado.
    }
  }, [team, pokemonSearch]);

  useEffect(() => {
    Promise.all([
      fetch("/data/wiki-pokedex.json").then(r => r.json()),
      fetch("/data/wiki-meta.json").then(r => r.json()),
      fetch("/data/wiki-bosses.json").then(r => r.json()),
      fetch("/data/wiki-encounters.json").then(r => r.json()),
    ]).then(([dex, meta, bossData, encounterData]) => {
      setMons(dex.mons);
      setMoves(meta.moves);
      setMaps(encounterData.maps ?? []);
      const all: Boss[] = [
        ...bossData.gyms,
        ...bossData.elite.map((x: Boss, i: number) => ({ ...x, id: x.id ?? `elite-${i}`, name: `Elite — ${x.name}` })),
        { ...bossData.champion, id: bossData.champion.id ?? "champion", name: `Campeão — ${bossData.champion.name}` },
        ...bossData.islands.map((x: Boss, i: number) => ({ ...x, id: x.id ?? `island-${i}`, name: `Ilha — ${x.name}` })),
      ];
      setBosses(all);
      setBossId(all[0]?.id ?? "");
      setGuideGymId(bossData.gyms[0]?.id ?? "");
      setLoading(false);
    });
  }, []);

  const monBySlug = useMemo(() => Object.fromEntries(mons.map(mon => [mon.slug, mon])), [mons]);
  const boss = bosses.find(item => item.id === bossId);
  const gyms = bosses.filter(item => item.id.startsWith("TRAINER_LEADER_"));

  const updateSlot = (index: number, patch: Partial<Slot>) => {
    setTeam(current => current.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
    setAnalyzed(false);
  };
  const updateIv = (index: number, stat: StatKey, value: number) => {
    setTeam(current => current.map((slot, i) => i === index
      ? { ...slot, ivs: { ...slot.ivs, [stat]: Math.max(0, Math.min(31, value || 0)) } }
      : slot
    ));
    setAnalyzed(false);
  };

  const recommend = (mon: Mon, level: number): { primary: Recommendation[]; alternative: Recommendation[] } => {
    if (!boss) return { primary: [], alternative: [] };
    const available = new Map<string, string>();
    mon.levelMoves.filter(x => x.lv <= level).forEach(x => available.set(x.slug, `Nível ${x.lv}`));
    mon.tmMoves.forEach(slug => available.set(slug, "TM/HM ou Tutor"));
    const candidates = [...available.entries()].flatMap(([slug, source]) => {
      const move = moves[slug];
      if (!move || !move.pow || move.cat === "status") return [];
      const attackStat = move.cat === "special" ? mon.base.spa : mon.base.atk;
      const stab = mon.types.includes(move.type) ? 1.5 : 1;
      const matchups = boss.team.map(enemy => {
        const enemyMon = monBySlug[enemy.slug];
        return enemyMon ? effectiveness(move.type, enemyMon.types) : 1;
      });
      const average = matchups.reduce((a, b) => a + b, 0) / Math.max(1, matchups.length);
      const usefulTargets = matchups.filter(x => x > 1).length;
      const score = move.pow * (move.acc || 100) / 100 * stab * average *
        (0.7 + attackStat / 200) * (1 + usefulTargets * .06);
      return [{ move, score, source }];
    }).sort((a, b) => b.score - a.score);

    const chooseSet = (pool: Recommendation[]) => {
      const chosen: Recommendation[] = [];
      for (const candidate of pool) {
        const duplicate = chosen.some(x => x.move.type === candidate.move.type && x.move.cat === candidate.move.cat);
        if (!duplicate || chosen.length >= 3) chosen.push(candidate);
        if (chosen.length === 4) break;
      }
      return chosen;
    };
    const primary = chooseSet(candidates);
    const used = new Set(primary.map(x => x.move.name));
    const alternativePool = candidates.filter(x => !used.has(x.move.name));
    const alternative = chooseSet(alternativePool);
    if (alternative.length < 4) {
      for (const candidate of candidates) {
        if (!alternative.some(x => x.move.name === candidate.move.name)) alternative.push(candidate);
        if (alternative.length === 4) break;
      }
    }
    return { primary, alternative };
  };

  const buildPlan = (
    mon: Mon,
    sets: { primary: Recommendation[]; alternative: Recommendation[] },
    ivs: Stats,
    nature: Nature,
  ): BuildPlan => {
    const naturalStats = projectedStats(mon, 100, ivs, {}, nature);
    const physicalMoves = sets.primary.filter(x => x.move.cat === "physical").reduce((sum, x) => sum + x.score, 0);
    const specialMoves = sets.primary.filter(x => x.move.cat === "special").reduce((sum, x) => sum + x.score, 0);
    const physical = physicalMoves * naturalStats.atk / Math.max(1, mon.base.atk);
    const special = specialMoves * naturalStats.spa / Math.max(1, mon.base.spa);
    const totalOffense = Math.max(1, physical + special);
    const mixed = physical / totalOffense >= .38 && special / totalOffense >= .38;
    const offense: StatKey = physical >= special ? "atk" : "spa";
    const unusedOffense: StatKey = offense === "atk" ? "spa" : "atk";
    const speedFavored = nature.up === "spe" || (
      nature.down !== "spe" && (naturalStats.spe >= 190 || mon.base.spe >= 85 || ivs.spe >= 24)
    );
    const bulky = naturalStats.hp + naturalStats.def + naturalStats.spd >= 650;
    const defensive: StatKey = naturalStats.def >= naturalStats.spd ? "def" : "spd";
    const secondary: StatKey = speedFavored ? "spe" : "hp";
    const tertiaryChoices: StatKey[] = ["hp", "def", "spd", "spe"];
    const tertiary = tertiaryChoices
      .filter(stat => stat !== secondary)
      .sort((a, b) => (ivs[b] + (nature.up === b ? 5 : nature.down === b ? -5 : 0)) - (ivs[a] + (nature.up === a ? 5 : nature.down === a ? -5 : 0)))[0];
    const natureImpact = nature.up
      ? `${nature.name} favorece ${STAT_LABELS[nature.up]} e reduz ${STAT_LABELS[nature.down!]}`
      : `${nature.name} é neutra`;
    const ivHighlight = (Object.keys(ivs) as StatKey[]).sort((a, b) => ivs[b] - ivs[a]).slice(0, 2);
    const basis = `${natureImpact}. Melhores IVs: ${ivHighlight.map(stat => `${STAT_LABELS[stat]} ${ivs[stat]}`).join(" e ")}.`;

    if (mixed) return {
      role: "ATACANTE MISTO",
      summary: `O moveset, os IVs e a Nature mantêm dano físico e especial relevantes. ${speedFavored ? "A Velocidade também é favorecida." : "HP oferece a melhor sustentação restante."}`,
      priorities: [
        { key: secondary, label: STAT_LABELS[secondary], points: 252, reason: speedFavored ? "Nature/IV favorecem agir primeiro" : "ganhar resistência" },
        { key: "atk", label: STAT_LABELS.atk, points: 128, reason: "golpes físicos" },
        { key: "spa", label: STAT_LABELS.spa, points: 128, reason: "golpes especiais" },
      ],
      avoid: "Não concentre tudo em apenas um ataque enquanto mantiver este moveset misto.",
      basis,
    };

    if (bulky && !speedFavored) return {
      role: offense === "atk" ? "BRUISER FÍSICO" : "BRUISER ESPECIAL",
      summary: `O dano calculado favorece ${STAT_LABELS[offense]}, enquanto os atributos-base, IVs e Nature apontam para uma função resistente.`,
      priorities: [
        { key: offense, label: STAT_LABELS[offense], points: 252, reason: "maior dano após IV/Nature" },
        { key: "hp", label: STAT_LABELS.hp, points: 252, reason: "aproveitar a resistência natural" },
        { key: defensive, label: STAT_LABELS[defensive], points: 4, reason: "ponto adicional efetivo" },
      ],
      avoid: `Evite investir em ${STAT_LABELS[unusedOffense]}: o moveset principal não depende desse atributo.`,
      basis,
    };

    return {
      role: offense === "atk" ? "ATACANTE FÍSICO" : "ATACANTE ESPECIAL",
      summary: `Após aplicar os IVs e a Nature, ${STAT_LABELS[offense]} produz o melhor dano. ${speedFavored ? "A combinação também favorece uma build rápida." : "HP é o investimento secundário mais consistente."}`,
      priorities: [
        { key: offense, label: STAT_LABELS[offense], points: 252, reason: "maior dano após IV/Nature" },
        { key: secondary, label: STAT_LABELS[secondary], points: 252, reason: speedFavored ? "aproveitar Nature e IV de Velocidade" : "ganhar resistência" },
        { key: tertiary, label: STAT_LABELS[tertiary], points: 4, reason: "melhor atributo restante" },
      ],
      avoid: `Evite investir em ${STAT_LABELS[unusedOffense]} enquanto usar estes golpes.`,
      basis,
    };
  };

  const bestNatures = (mon: Mon, build: BuildPlan): Nature[] => {
    const main = build.priorities[0]?.key;
    const speedBuild = build.priorities.some(priority => priority.key === "spe" && priority.points >= 252);
    if (build.role.includes("MISTO")) return ["Hasty", "Naive"].map(name => NATURES.find(nature => nature.name === name)!);
    if (main === "atk") {
      const names = speedBuild ? ["Jolly", "Adamant"] : ["Adamant", "Brave"];
      return names.map(name => NATURES.find(nature => nature.name === name)!);
    }
    if (main === "spa") {
      const names = speedBuild ? ["Timid", "Modest"] : ["Modest", "Quiet"];
      return names.map(name => NATURES.find(nature => nature.name === name)!);
    }
    if (main === "def") return ["Bold", "Impish"].map(name => NATURES.find(nature => nature.name === name)!);
    if (main === "spd") return ["Calm", "Careful"].map(name => NATURES.find(nature => nature.name === name)!);
    return ["Hardy", "Serious"].map(name => NATURES.find(nature => nature.name === name)!);
  };

  const results = team.flatMap((slot, index) => {
    const mon = monBySlug[slot.slug];
    if (!mon) return [];
    const sets = recommend(mon, slot.level);
    const coverage = boss ? boss.team.map(enemy => {
      const defender = monBySlug[enemy.slug];
      return Math.max(...sets.primary.map(rec => defender ? effectiveness(rec.move.type, defender.types) : 1), 0);
    }) : [];
    const score = sets.primary.reduce((total, rec) => total + rec.score, 0) / Math.max(1, sets.primary.length);
    const selectedNature = NATURES.find(nature => nature.name.toLowerCase() === slot.nature.trim().toLowerCase()) ?? NATURES[0];
    const build = buildPlan(mon, sets, slot.ivs, selectedNature);
    const trainedEvs = Object.fromEntries(build.priorities.map(priority => [priority.key, priority.points])) as Partial<Stats>;
    return [{
      index, mon, level: slot.level, ivs: slot.ivs, nature: selectedNature, sets, coverage, score, build,
      natureSuggestions: bestNatures(mon, build),
      currentStats: projectedStats(mon, slot.level, slot.ivs, {}, selectedNature),
      trainedStats: projectedStats(mon, slot.level, slot.ivs, trainedEvs, selectedNature),
    }];
  }).sort((a, b) => b.score - a.score);

  const bossMax = boss ? Math.max(...boss.team.map(x => x.level)) : 0;
  const averageLevel = results.length ? results.reduce((a, b) => a + b.level, 0) / results.length : 0;
  const recommendedLevel = bossMax;
  const safeLevel = Math.min(1000, Math.ceil(bossMax * 1.08));
  const readiness = !results.length ? 0 : Math.max(0, Math.min(100,
    50 + ((averageLevel - recommendedLevel) / Math.max(1, recommendedLevel)) * 100 +
    results.reduce((sum, item) => sum + item.coverage.filter(x => x > 1).length, 0) * 1.8
  ));
  const trainingZones = useMemo<TrainingZone[]>(() => maps.flatMap(map =>
    (map.levelZones ?? []).map(zone => ({
      name: map.name,
      min: Number(zone.minLevel),
      max: Number(zone.maxLevel),
      area: zone.area,
    }))
  ).filter(zone =>
    Number.isFinite(zone.min) && Number.isFinite(zone.max) &&
    zone.min >= 1 && zone.max <= 1000 && zone.max >= zone.min
  ), [maps]);

  const trainingPath = (start: number, target: number) => {
    if (start >= target) return [];
    const gap = target - start;
    const sampleLevels = gap <= 35
      ? [start + 1, target - 1]
      : gap <= 100
        ? [start + 1, Math.round(start + gap * .55), target - 1]
        : [start + 1, Math.round(start + gap * .36), Math.round(start + gap * .7), target - 1];
    const excluded = target < 900 ? /(Birth Island|Navel Rock|Sevii|Five Island|Four Island|One Island|Two Island|Three Island|Six Island|Seven Island|Mt\.? Ember|Prototype)/i : /Prototype/i;
    const eligible = trainingZones.filter(zone => zone.min <= target && !excluded.test(zone.name));
    const priority = (zone: TrainingZone) =>
      /Route|Forest|Mt\.? Moon|Rock Tunnel|Pok[eé]mon Tower|Power Plant|Mansion|Cave/i.test(zone.name) ? 0 :
        /City/i.test(zone.name) ? 2 : 1;
    const chosen = sampleLevels.map(level => {
      const exact = eligible.filter(zone => zone.min <= level && zone.max >= level);
      const pool = exact.length ? exact : eligible.filter(zone => zone.max >= Math.min(target, level) && zone.min <= Math.min(target, level + 25));
      return [...pool].sort((a, b) =>
        priority(a) - priority(b) ||
        Math.abs((a.min + a.max) / 2 - level) - Math.abs((b.min + b.max) / 2 - level)
      )[0];
    }).filter((zone): zone is TrainingZone => Boolean(zone));
    return chosen.filter((zone, index) => chosen.findIndex(item => item.name === zone.name && item.min === zone.min && item.max === zone.max) === index);
  };

  const catchGuide = useMemo(() => {
    const starter = monBySlug[starterSlug];
    const targetIndex = Math.max(0, gyms.findIndex(gym => gym.id === guideGymId));
    const selectedGyms = gyms.slice(0, targetIndex + 1);
    const alreadySuggested = new Set<string>(starter ? [starter.slug] : []);

    return selectedGyms.map((gym, gymIndex) => {
      const gymMax = Math.max(...gym.team.map(enemy => enemy.level));
      const previousMax = gymIndex ? Math.max(...selectedGyms[gymIndex - 1].team.map(enemy => enemy.level)) : 0;
      const candidates = new Map<string, CatchOption>();

      for (const map of maps) {
        const zones = map.levelZones ?? [];
        const routeLevel = zones.length ? Math.min(...zones.map(zone => Number(zone.minLevel))) : 0;
        if (!routeLevel || routeLevel > gymMax || routeLevel <= Math.max(0, previousMax - 25)) continue;
        if (/Birth Island|Navel Rock|Sevii|Island|Prototype/i.test(map.name)) continue;

        const methods = (map as GameMap & { methods?: Record<string, Encounter[] | Record<string, Encounter[]>> }).methods ?? {};
        for (const [methodName, raw] of Object.entries(methods)) {
          const groups: [string, Encounter[]][] = Array.isArray(raw)
            ? [[methodName, raw]]
            : Object.entries(raw ?? {}).map(([rod, list]) => [`${methodName}/${rod}`, list]);
          for (const [method, encounters] of groups) {
            for (const encounter of encounters) {
              const mon = monBySlug[encounter.slug];
              if (!mon || alreadySuggested.has(mon.slug) || encounter.min > gymMax) continue;
              const matchups = gym.team.map(enemy => {
                const defender = monBySlug[enemy.slug];
                return defender ? Math.max(...mon.types.map(type => effectiveness(type, defender.types))) : 1;
              });
              const strongTargets = matchups.filter(value => value > 1).length;
              const enemyAttackTypes = gym.team.flatMap(enemy => enemy.moves.map(move => move.type));
              const resisted = enemyAttackTypes.filter(type => effectiveness(type, mon.types) < 1).length;
              const weak = enemyAttackTypes.filter(type => effectiveness(type, mon.types) > 1).length;
              const stats = mon.base.hp + Math.max(mon.base.atk, mon.base.spa) * 1.4 + mon.base.def + mon.base.spd + mon.base.spe * .5;
              const availability = Math.max(0, 1 - Math.abs(gymMax * .72 - encounter.max) / Math.max(1, gymMax));
              const score = strongTargets * 85 + resisted * 7 - weak * 8 + stats * .12 + availability * 25 + Math.min(10, (encounter.pct ?? 0) / 10);
              const option: CatchOption = {
                mon, route: map.name, method, min: encounter.min, max: encounter.max,
                chance: encounter.pct, score,
                strongTypes: mon.types.filter(type => gym.team.some(enemy => {
                  const defender = monBySlug[enemy.slug];
                  return defender && effectiveness(type, defender.types) > 1;
                })),
                role: strongTargets >= Math.ceil(gym.team.length / 2) ? "Atacante principal" : resisted > weak ? "Troca defensiva" : "Cobertura",
              };
              if (!candidates.has(mon.slug) || option.score > candidates.get(mon.slug)!.score) candidates.set(mon.slug, option);
            }
          }
        }
      }

      const choices = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 3);
      choices.forEach(choice => alreadySuggested.add(choice.mon.slug));
      const starterTypes = starter?.types.filter(type => gym.team.some(enemy => {
        const defender = monBySlug[enemy.slug];
        return defender && effectiveness(type, defender.types) > 1;
      })) ?? [];
      return { gym, choices, starterUseful: starterTypes.length > 0, starterTypes };
    });
  }, [guideGymId, gyms, maps, monBySlug, starterSlug]);

  if (loading) return <main className="loading"><div className="spinner" /><p>Carregando dados oficiais…</p></main>;

  return (
    <main>
      <aside className="siteSidebar">
        <div className="officialBrand">
          <img src="/brand/ultimate-poke-idle.png" alt="Ultimate Poke Idle" />
          <strong>CALCULATOR</strong>
          <small>FERRAMENTA DA COMUNIDADE</small>
        </div>
        <div className="sideDivider" />
        <small className="sideLabel">CALCULADORA</small>
        <nav className="sideNav">
          <button className={view === "battle" ? "active" : ""} onClick={() => setView("battle")}><span>⚔</span> Confrontos</button>
          <button className={view === "beginner" ? "active" : ""} onClick={() => setView("beginner")}><span>◈</span> Guia para iniciantes</button>
          <button className={view === "tutorial" ? "active" : ""} onClick={() => setView("tutorial")}><span>?</span> Como usar</button>
        </nav>
        <small className="sideLabel">DADOS ANALISADOS</small>
        <div className="sideFacts">
          <span><i>◆</i> 649 Pokémon</span>
          <span><i>◆</i> 559 golpes</span>
          <span><i>◆</i> Ginásios e rotas</span>
        </div>
        <div className="serverBox"><span className="onlineDot" /><div><small>CALCULADORA</small><b>Online</b><em>Dados da Wiki carregados</em></div></div>
      </aside>
      <div className="appMain">
      <header className="topbar">
        <div className="mobileBrand"><img src="/brand/ultimate-poke-idle.png" alt="" /><b>CALCULATOR</b></div>
        <span className="pageCrumb">⌂ &nbsp; Ultimate Poke Idle &nbsp;/&nbsp; Calculator</span>
        <div className="topbarActions">
          <button
            type="button"
            className="themeToggle"
            onClick={() => setTheme(current => current === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
            title={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
          >
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
            {theme === "light" ? "Tema escuro" : "Tema claro"}
          </button>
          <span className="status"><i /> Dados da progressão v2</span>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">CENTRAL DE ESTRATÉGIA</p>
          <h1>Ultimate Poke Idle <span>Calculator</span></h1>
          <p className="intro">Monte seu time, compare níveis e receba uma sugestão inicial de moveset usando os dados disponíveis na Wiki do Ultimate Poke Idle.</p>
        </div>
        <div className="heroDevice"><span>◫</span><small>BATTLE<br />ANALYZER</small></div>
      </section>

      <nav className="modeTabs" aria-label="Modos da calculadora">
        <button className={view === "battle" ? "active" : ""} onClick={() => setView("battle")}>Calculadora de batalha</button>
        <button className={view === "beginner" ? "active" : ""} onClick={() => setView("beginner")}>Guia para iniciantes</button>
        <button className={view === "tutorial" ? "active" : ""} onClick={() => setView("tutorial")}>Como usar</button>
      </nav>

      {view === "battle" && <><section className="workspace">
        <aside className="panel challenge">
          <div className="sectionTitle"><span>1</span><div><small>DESAFIO</small><h2>Escolha o adversário</h2></div></div>
          <label>Ginásio, Elite ou boss</label>
          <select value={bossId} onChange={e => { setBossId(e.target.value); setAnalyzed(false); }}>
            {bosses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {boss && <>
            <div className="bossMeta"><div><small>TIPO PRINCIPAL</small><b>{boss.type ?? "Variado"}</b></div><div><small>FAIXA</small><b>Lv. {Math.min(...boss.team.map(x => x.level))}–{bossMax}</b></div></div>
            <div className="bossTeam">
              {boss.team.map(enemy => {
                const enemyData = monBySlug[enemy.slug];
                return <div className="enemy" key={`${enemy.slug}-${enemy.level}`}>
                  {enemyData && <PokemonSprite dex={enemyData.dex} name={enemy.name} className="enemySprite" />}
                  <span>{enemy.name}</span><b>Lv. {enemy.level}</b>{Boolean(enemy.ace) && <em>ACE</em>}
                </div>;
              })}
            </div>
          </>}
        </aside>

        <section className="panel teamPanel">
          <div className="sectionTitle"><span>2</span><div><small>SEU TIME</small><h2>Informe seus Pokémon</h2></div></div>
          <div className="teamGrid">
            {team.map((slot, index) => {
              const selected = monBySlug[slot.slug];
              return <div className={`slot ${selected ? "filled" : ""}`} key={index}>
                <div className="slotNumber">0{index + 1}</div>
                {selected && <PokemonSprite dex={selected.dex} name={selected.name} className="slotSprite" />}
                <div className="slotFields">
                  <label>Pokémon</label>
                  <input
                    className="pokemonInput"
                    list={`pokemon-list-${index}`}
                    placeholder="Digite o nome…"
                    value={pokemonSearch[index]}
                    onChange={e => {
                      const value = e.target.value;
                      setPokemonSearch(current => current.map((text, i) => i === index ? value : text));
                      const exact = mons.find(mon =>
                        mon.name.toLocaleLowerCase("pt-BR") === value.trim().toLocaleLowerCase("pt-BR") ||
                        `#${String(mon.dex).padStart(3, "0")} ${mon.name}`.toLocaleLowerCase("pt-BR") === value.trim().toLocaleLowerCase("pt-BR")
                      );
                      updateSlot(index, { slug: exact?.slug ?? "" });
                    }}
                  />
                  <datalist id={`pokemon-list-${index}`}>
                    {mons.map(mon => <option value={mon.name} key={mon.slug}>#{String(mon.dex).padStart(3, "0")} · {mon.types.join(" / ")}</option>)}
                  </datalist>
                </div>
                <div className="levelField"><label>Nível</label><input type="number" min="1" max="1000" value={slot.level} onChange={e => updateSlot(index, { level: Math.max(1, Math.min(1000, Number(e.target.value))) })} /></div>
                {selected && <div className="typeRow">{selected.types.map(type => <span className={`type type-${type.toLowerCase()}`} key={type}>{type}</span>)}</div>}
                {selected && <details className="ivEditor">
                  <summary>Informar IVs <span>0–31</span></summary>
                  <div className="ivInputGrid">
                    {(Object.keys(STAT_LABELS) as StatKey[]).map(stat => <label key={stat}>
                      {STAT_LABELS[stat]}
                      <input
                        type="number"
                        min="0"
                        max="31"
                        value={slot.ivs[stat]}
                        aria-label={`IV de ${STAT_LABELS[stat]} de ${selected.name}`}
                        onChange={e => updateIv(index, stat, Number(e.target.value))}
                      />
                    </label>)}
                  </div>
                  <label className="natureField">
                    Nature
                    <input
                      list={`nature-list-${index}`}
                      placeholder="Digite a Nature…"
                      value={slot.nature}
                      onChange={e => updateSlot(index, { nature: e.target.value })}
                    />
                    <datalist id={`nature-list-${index}`}>
                      {NATURES.map(nature => <option value={nature.name} key={nature.name}>{natureDescription(nature)}</option>)}
                    </datalist>
                  </label>
                  <small>Digite os IVs mostrados na Pokédex do jogo.</small>
                </details>}
              </div>;
            })}
          </div>
          <button className="analyze" disabled={!team.some(x => x.slug)} onClick={() => setAnalyzed(true)}>Analisar confronto <span>→</span></button>
        </section>
      </section>

      {analyzed && boss && <section className="results">
        <div className="resultHeader">
          <div><p className="eyebrow">RELATÓRIO DO CONFRONTO</p><h2>Plano contra {boss.name}</h2></div>
          <div className={`readiness ${readiness >= 70 ? "good" : readiness >= 45 ? "medium" : "low"}`}><strong>{Math.round(readiness)}%</strong><span>preparo estimado</span></div>
        </div>
        <div className="levelCards">
          <div><small>MÉDIA DO TIME</small><strong>Lv. {Math.round(averageLevel)}</strong></div>
          <div><small>RECOMENDADO</small><strong>Lv. {recommendedLevel}</strong></div>
          <div><small>MARGEM SEGURA</small><strong>Lv. {safeLevel}</strong></div>
          <div><small>TROCAS MÁXIMAS</small><strong>₽ {fmt(results.length * 4 * 5000)}</strong></div>
        </div>
        <p className="notice"><b>IVs e EVs:</b> o IV é uma característica própria do Pokémon; o treinamento manual mostrado no jogo distribui EVs. As builds abaixo respeitam 252 EVs por atributo, 510 no total e priorizam os 508 pontos que produzem efeito.</p>
        <section className="training">
          <div className="trainingTitle">
            <div><small>PLANO DE EVOLUÇÃO</small><h3>Rota de treinamento até o nível recomendado</h3></div>
            <span>Meta: Lv. {recommendedLevel}</span>
          </div>
          {results.some(item => item.level < recommendedLevel) ? (
            <div className="trainingGrid">
              {results.filter(item => item.level < recommendedLevel).map(item => {
                const path = trainingPath(item.level, recommendedLevel);
                return <article className="trainingCard" key={`training-${item.mon.slug}`}>
                  <div className="trainingMon">
                    <PokemonSprite dex={item.mon.dex} name={item.mon.name} className="trainingSprite" />
                    <div><b>{item.mon.name}</b><small>Lv. {item.level} → Lv. {recommendedLevel}</small></div>
                    <strong>+{recommendedLevel - item.level} níveis</strong>
                  </div>
                  <div className="routeSteps">
                    {path.map((zone, index) => <div className="routeStep" key={`${zone.name}-${zone.min}-${zone.max}`}>
                      <span>{index + 1}</span>
                      <div><b>{zone.name}</b><small>Pokémon selvagens Lv. {zone.min}–{zone.max}{zone.area ? ` · ${zone.area}` : ""}</small></div>
                    </div>)}
                    {!path.length && <p className="empty">Ainda não há uma rota adequada registrada para esta faixa.</p>}
                  </div>
                </article>;
              })}
            </div>
          ) : <p className="trainingReady">Seu time já alcançou o nível recomendado para este confronto.</p>}
          <p className="trainingNote">As rotas seguem as faixas de nível da Wiki. Use apenas locais que já estejam liberados na sua progressão.</p>
        </section>
        <div className="recommendations">
          {results.map((item, rank) => <article className="recommendation" key={item.mon.slug}>
            <div className="monHead"><div className="rank">#{rank + 1}</div><PokemonSprite dex={item.mon.dex} name={item.mon.name} className="resultSprite" /><div><h3>{item.mon.name}</h3><p>Lv. {item.level} · {item.mon.types.join(" / ")}</p></div><span className="role">{rank === 0 ? "MELHOR OPÇÃO" : "COBERTURA"}</span></div>
            <div className="buildBlock">
              <div className="buildHeading"><div><small>BUILD DE EVs SUGERIDA</small><b>{item.build.role}</b></div><span>508 úteis / 510 máximos</span></div>
              <p>{item.build.summary}</p>
              <p className="buildBasis">{item.build.basis}</p>
              <div className="ivPriorities">
                {item.build.priorities.map((priority, index) => <div className={`ivPriority priority-${index + 1}`} key={priority.key}>
                  <span>{index + 1}ª</span>
                  <div><b>{priority.label}</b><small>{priority.reason}</small></div>
                  <strong>{priority.points} EV</strong>
                </div>)}
              </div>
              <small className="buildAvoid">{item.build.avoid} A distribuição soma 508 EVs efetivos; os 2 restantes podem ser aplicados, mas não completam outro grupo de 4.</small>
              <div className="natureSuggestions">
                <small>MELHORES NATURES PARA ESTA BUILD</small>
                <div>{item.natureSuggestions.map((nature, index) => <span key={nature.name}><b>{index + 1}. {nature.name}</b><em>{natureDescription(nature)}</em></span>)}</div>
              </div>
              <div className="statProjection">
                <div className="projectionHeading">
                  <div><small>PROJEÇÃO DE ATRIBUTOS NO LV. {item.level}</small><b>IVs informados + EVs recomendados</b></div>
                  <span>{item.nature.name} · {natureDescription(item.nature)}</span>
                </div>
                <div className="statProjectionGrid">
                  {(Object.keys(STAT_LABELS) as StatKey[]).map(stat => <div className="projectedStat" key={stat}>
                    <small>{STAT_LABELS[stat]}</small>
                    <span>{item.currentStats[stat]}</span>
                    <b>→ {item.trainedStats[stat]}</b>
                    <em>+{item.trainedStats[stat] - item.currentStats[stat]}</em>
                  </div>)}
                </div>
                <p>Valor à esquerda: sem EVs. Valor à direita: depois da build sugerida acima.</p>
              </div>
            </div>
            <div className="movesetBlock">
              <div className="movesetLabel"><b>Moveset principal</b><span>Melhor pontuação para este confronto</span></div>
              <div className="moves">
                {item.sets.primary.map(rec => <div className="move" key={rec.move.name}>
                  <div><span className={`type type-${rec.move.type.toLowerCase()}`}>{rec.move.type}</span><b>{rec.move.name}</b></div>
                  <p>{rec.move.cat === "physical" ? "Físico" : "Especial"} · Poder {rec.move.pow} · Precisão {rec.move.acc || "—"}%</p>
                  <small>{rec.source} · Custo estimado no Tutor: ₽ 5.000</small>
                </div>)}
                {!item.sets.primary.length && <p className="empty">Nenhum golpe ofensivo elegível foi encontrado para este nível.</p>}
              </div>
            </div>
            <div className="movesetBlock alternative">
              <div className="movesetLabel"><b>Moveset alternativo</b><span>Use se algum golpe principal não estiver no Tutor</span></div>
              <div className="moves">
                {item.sets.alternative.map(rec => <div className="move" key={rec.move.name}>
                  <div><span className={`type type-${rec.move.type.toLowerCase()}`}>{rec.move.type}</span><b>{rec.move.name}</b></div>
                  <p>{rec.move.cat === "physical" ? "Físico" : "Especial"} · Poder {rec.move.pow} · Precisão {rec.move.acc || "—"}%</p>
                  <small>{rec.source} · Alternativa sugerida</small>
                </div>)}
              </div>
            </div>
            <div className="coverage"><small>COBERTURA CONTRA A EQUIPE</small><div>{boss.team.map((enemy, i) => <span title={enemy.name} className={item.coverage[i] > 1 ? "super" : item.coverage[i] === 0 ? "immune" : "neutral"} key={enemy.slug}>{enemy.name.slice(0, 3)}</span>)}</div></div>
          </article>)}
        </div>
      </section>}</>}

      {view === "beginner" && <section className="beginner">
        <div className="beginnerIntro">
          <p className="eyebrow">ROTA DE CAPTURAS</p>
          <h2>Comece com um Pokémon.<br />Monte o time durante a jornada.</h2>
          <p>Escolha seu inicial e até qual ginásio deseja planejar. A calculadora procura Pokémon que aparecem antes de cada desafio e prioriza quem ajuda contra a equipe completa do líder.</p>
        </div>
        <div className="beginnerSetup panel">
          <div>
            <label>Seu Pokémon inicial</label>
            <input
              className="pokemonInput"
              list="starter-list"
              placeholder="Digite o nome…"
              value={starterSearch}
              onChange={e => {
                const value = e.target.value;
                setStarterSearch(value);
                const exact = mons.find(mon => mon.name.toLocaleLowerCase("pt-BR") === value.trim().toLocaleLowerCase("pt-BR"));
                setStarterSlug(exact?.slug ?? "");
              }}
            />
            <datalist id="starter-list">{mons.map(mon => <option value={mon.name} key={mon.slug}>{mon.types.join(" / ")}</option>)}</datalist>
          </div>
          <div>
            <label>Planejar até</label>
            <select value={guideGymId} onChange={e => setGuideGymId(e.target.value)}>
              {gyms.map(gym => <option value={gym.id} key={gym.id}>{gym.name}</option>)}
            </select>
          </div>
          {starterSlug && monBySlug[starterSlug] && <div className="starterCard">
            <PokemonSprite dex={monBySlug[starterSlug].dex} name={monBySlug[starterSlug].name} className="starterSprite" />
            <div><small>SEU INICIAL</small><b>{monBySlug[starterSlug].name}</b><span>{monBySlug[starterSlug].types.join(" / ")}</span></div>
          </div>}
        </div>

        {!starterSlug ? <div className="guideEmpty"><b>Escolha seu inicial para criar a rota.</b><span>Você pode digitar o nome completo ou selecionar uma sugestão.</span></div> :
          <div className="journey">
            {catchGuide.map((stage, stageIndex) => <article className="journeyStage" key={stage.gym.id}>
              <div className="stageRail"><span>{stageIndex + 1}</span></div>
              <div className="stageContent">
                <header className="stageHeader">
                  <div><small>PRÓXIMO DESAFIO</small><h3>{stage.gym.name}</h3><p>Líder {stage.gym.leader?.replace("_", " ")} · equipe até Lv. {Math.max(...stage.gym.team.map(x => x.level))}</p></div>
                  <span className="gymType">{stage.gym.type ?? "Variado"}</span>
                </header>
                {stage.starterUseful && <div className="starterAdvantage">Seu inicial já oferece cobertura útil com ataques do tipo {stage.starterTypes.join(" / ")}.</div>}
                <div className="catchGrid">
                  {stage.choices.map((choice, choiceIndex) => <div className="catchCard" key={choice.mon.slug}>
                    <div className="catchTop">
                      <span className="catchRank">{choiceIndex + 1}</span>
                      <PokemonSprite dex={choice.mon.dex} name={choice.mon.name} className="catchSprite" />
                      <div><small>{choice.role}</small><b>{choice.mon.name}</b><div>{choice.mon.types.map(type => <span className={`type type-${type.toLowerCase()}`} key={type}>{type}</span>)}</div></div>
                    </div>
                    <div className="catchRoute"><small>ONDE CAPTURAR</small><b>{choice.route}</b><span>Lv. {choice.min}–{choice.max} · {choice.method.replace("/", " / ")}{choice.chance ? ` · ${choice.chance}%` : ""}</span></div>
                    <p>{choice.strongTypes.length ? `Boa cobertura ofensiva com ${choice.strongTypes.join(" / ")}.` : "Ajuda a equilibrar as fraquezas do time nesta etapa."}</p>
                  </div>)}
                  {!stage.choices.length && <p className="empty">Não foi encontrada uma captura nova nas rotas registradas para esta etapa.</p>}
                </div>
              </div>
            </article>)}
          </div>}
        <p className="guideNote">O guia considera os encontros e níveis registrados na Wiki. Pesca e outras formas de encontro aparecem identificadas; confirme se o método já foi liberado no seu progresso.</p>
      </section>}

      {view === "tutorial" && <section className="tutorial">
        <header className="tutorialIntro">
          <p className="eyebrow">GUIA RÁPIDO</p>
          <h2>Como usar a calculadora</h2>
          <p>Monte seu time uma vez, informe os atributos do jogo e use o relatório para preparar cada Pokémon antes do confronto.</p>
        </header>

        <div className="tutorialSteps">
          <article className="tutorialStep">
            <span>1</span>
            <div><small>ESCOLHA O DESAFIO</small><h3>Selecione o líder ou boss</h3><p>Na aba <b>Calculadora de batalha</b>, escolha quem você enfrentará. A equipe, os níveis e o Pokémon ACE do adversário aparecerão automaticamente.</p></div>
          </article>
          <article className="tutorialStep">
            <span>2</span>
            <div><small>MONTE SEU TIME</small><h3>Digite seus Pokémon e níveis</h3><p>Comece a escrever o nome e selecione o Pokémon. Informe o nível atual de cada integrante da equipe.</p></div>
          </article>
          <article className="tutorialStep">
            <span>3</span>
            <div><small>ATRIBUTOS REAIS</small><h3>Preencha IVs e Nature</h3><p>Abra <b>Informar IVs</b> em cada Pokémon e copie os números mostrados na Pokédex do jogo. Depois selecione a Nature atual.</p></div>
          </article>
          <article className="tutorialStep">
            <span>4</span>
            <div><small>GERAR O PLANO</small><h3>Clique em Analisar confronto</h3><p>A calculadora compara seu time com a equipe do adversário e mostra preparo estimado, nível recomendado, margem segura e rota para treinamento.</p></div>
          </article>
          <article className="tutorialStep">
            <span>5</span>
            <div><small>PREPARE AS BUILDS</small><h3>Confira EVs, Nature e movesets</h3><p>Use a distribuição de EVs sugerida, escolha uma das duas melhores Natures e procure os golpes do moveset principal no Tutor. Se algum não existir, use o moveset alternativo.</p></div>
          </article>
          <article className="tutorialStep">
            <span>6</span>
            <div><small>INICIANTES</small><h3>Use o guia de capturas</h3><p>Quem está começando pode abrir <b>Guia para iniciantes</b>, informar apenas o inicial e descobrir quais Pokémon capturar antes de cada ginásio.</p></div>
          </article>
        </div>

        <div className="tutorialInfo">
          <div><span>✓</span><p><b>Seu time fica salvo.</b> Ao voltar pelo mesmo navegador e dispositivo, Pokémon, níveis, IVs e Natures serão restaurados.</p></div>
          <div><span>!</span><p><b>Confira o Tutor.</b> Os golpes são sugestões baseadas nos dados disponíveis; use a alternativa se algum golpe não aparecer no jogo.</p></div>
        </div>

        <button className="tutorialStart" onClick={() => setView("battle")}>Montar minha equipe <span>→</span></button>
      </section>}

      <footer><p>Ferramenta independente para testes da comunidade. Dados baseados na Wiki do Ultimate Poke Idle.</p><span>Versão experimental 1.1</span></footer>
      </div>
    </main>
  );
}
