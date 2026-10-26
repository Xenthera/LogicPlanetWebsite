export type Feature = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  home: boolean;
};

// Claims here match what the game currently runs. See the Logic Planet README
// and docs/multiplayer.md. Do not add a capability until it is in the game.
export const features: Feature[] = [
  {
    id: "place",
    eyebrow: "Building",
    title: "Place parts in open space",
    body: "Logic Planet is a 3D sandbox, not a flat schematic. You set parts down in the world and walk around what you are making.",
    image: "/placeholders/building.svg",
    imageAlt: "Placeholder labeled Building. A drawn frame, not a screenshot of the game.",
    home: true,
  },
  {
    id: "wires",
    eyebrow: "Simulation",
    title: "Wires carry the signal. Ticks run the world.",
    body: "A wire adds no delay of its own. The world advances in ticks, and the cost follows how much of the circuit is switching, not only how large the world is.",
    image: "/placeholders/boards.svg",
    imageAlt: "Placeholder labeled Simulation. A drawn frame, not a screenshot of the game.",
    home: true,
  },
  {
    id: "boards",
    eyebrow: "Boards",
    title: "Boards are containers you can move",
    body: "Build on a circuit board, then pick the board up and move it. The circuit stays together because the board is part of the world, not a separate file you only open.",
    image: "/placeholders/boards.svg",
    imageAlt: "Placeholder labeled Boards. A drawn frame, not a screenshot of the game.",
    home: true,
  },
  {
    id: "ics",
    eyebrow: "Reuse",
    title: "Pack a circuit into a chip",
    body: "A finished circuit can be packed into an integrated circuit and used as one part. You build the inside once, then place the chip wherever that behavior is needed.",
    image: "/placeholders/building.svg",
    imageAlt: "Placeholder labeled Building. A drawn frame, not a screenshot of the game.",
    home: true,
  },
  {
    id: "fpga",
    eyebrow: "Programmable logic",
    title: "FPGA chips run with the world",
    body: "An FPGA chip runs its own program on the same tick as the circuit around it, and it keeps its own memory. The pins are part of the world; the program is what happens between them.",
    image: "/placeholders/together.svg",
    imageAlt: "Placeholder labeled Program. A drawn frame, not a screenshot of the game.",
    home: false,
  },
  {
    id: "multiplayer",
    eyebrow: "Together",
    title: "One host, one world",
    body: "Someone hosts. Their machine is the one that ticks. Everyone who joins shares that world: the same parts, the same wires, and the lights as they change. It is not a lockstep replay of each person's own copy.",
    image: "/placeholders/together.svg",
    imageAlt: "Placeholder labeled Together. A drawn frame, not a screenshot of the game.",
    home: true,
  },
  {
    id: "import",
    eyebrow: "Import",
    title: "Bring in a Logic World subassembly",
    body: "Logic Planet reads the Logic World subassembly format, so a build from that game can come in as a starting point instead of being redrawn pin by pin.",
    image: "/placeholders/boards.svg",
    imageAlt: "Placeholder labeled Import. A drawn frame, not a screenshot of the game.",
    home: false,
  },
];

export const homeFeatures = features.filter((feature) => feature.home);
