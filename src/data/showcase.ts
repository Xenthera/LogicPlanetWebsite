export type FeatureLayout = "lead" | "mirror" | "card" | "card-top" | "tall" | "offset" | "wide";

export type Feature = {
  id: string;
  /**
   * lead: large image on the left, text on the right.
   * mirror: the same size, with the text on the left and the image on the right.
   * card: half width, image with the text below it.
   * card-top: half width, text above the image. Pair these with card for a 2×2.
   * tall and offset: a pair side by side. Put them next to each other in the list.
   * wide: a full-width panorama with the text below.
   */
  layout: FeatureLayout;
  title: string;
  description: string;
  /** Optional alt text for the frames filled from src/content/features/<id>/. */
  imageAlt?: string;
  link?: { href: string; label: string };
};

export type Slide = {
  image?: string;
  alt?: string;
};

// The rotating screenshots at the top of the homepage, shown at 16:9.
// Pictures go in src/content/gameplay/, named so they end in -1, -2, -3
// before the extension. Each number fills that slide. A missing number stays
// an empty slide. These four frames always show; a higher number adds another.
export const heroSlides: Slide[] = [{}, {}, {}, {}];

// Placeholder copy until the real feature text is written.
const lorem =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

// Pictures go in src/content/features/<id>/, named so they end in -1, -2, -3
// before the extension. Each number is one frame. A missing number stays an
// empty frame, and the highest number is how many frames the card holds.
// The card shows one frame at a time. With no pictures, it keeps one empty frame.
// Order here is the order on the homepage.
export const features: Feature[] = [
  {
    id: "circuit-building",
    layout: "lead",
    title: "Circuit Building",
    description:
      "Build intricate digital circuits with intuitive tools for placing multiple wires, organizing components on boards, and copying and pasting entire sections of your design. From simple logic gates to sprawling interconnected systems, create, refine, and expand your circuits with ease.",
  },
  {
    id: "multiplayer",
    layout: "mirror",
    title: "Multiplayer",
    description:
      "Host a game, invite your friends, and build circuits together in real time. Collaborate on complex creations, experiment with ideas, and bring your digital worlds to life as a team.",
  },
  {
    id: "fpgas",
    layout: "lead",
    title: "FPGAs",
    description:
      "Write custom chip behavior in C# with the built-in editor. Define your own inputs and outputs, program whatever logic you need, and build components that do exactly what you want. Inspect and edit chip memory directly in the hex editor, or upload and dump ROMs and other data whenever you need to. Whether you're building a simple custom component or designing an entire processor, you have the freedom to make your chips work your way.",
  },
  {
    id: "integrated-circuits",
    layout: "mirror",
    title: "Integrated Circuits",
    description:
      "Design logic inside integrated circuits, then use those chips as components in larger designs. Nest chips inside chips to build reusable building blocks, hide the underlying complexity, and turn complicated circuits into simple, easy-to-use components. Create your own library of logic, reuse it across projects, and keep scaling your designs without getting buried in wires.",
  },
  {
    id: "analog",
    layout: "lead",
    title: "Analog",
    description:
      "Every wire carries a signal from 0 to 255, giving you 256 distinct levels from fully off to fully on. Use analog components to add, subtract, scale, compare, and filter signals, shaping and combining them to create more complex behavior. FPGAs work with these signals too, letting you build custom programmable components that process analog values however you want. From simple signal operations to entirely custom systems, explore a whole other dimension of circuit design.",
  },
  { id: "buses", layout: "card-top", title: "Buses", description: lorem },
  { id: "library", layout: "card", title: "Library", description: lorem },
];

export type MoreFeature = {
  id: string;
  title: string;
  description: string;
};

// One picture each, in src/content/more/<id>/. Drop a single image in the
// folder. These are paged as their own section under the main features.
export const moreFeatures: MoreFeature[] = [
  { id: "wire-tracing", title: "Wire Tracing", description: lorem },
  { id: "pin-labeling", title: "Pin Labeling", description: lorem },
  { id: "wire-coloring", title: "Wire Coloring", description: lorem },
  { id: "signs", title: "Signs", description: lorem },
  { id: "keys", title: "Keys", description: lorem },
  { id: "hotbar", title: "Hotbar and Parts Drawer", description: lorem },
  { id: "copy-paste", title: "Copy, Cut, Paste, and Undo", description: lorem },
  { id: "selection", title: "Selection", description: lorem },
  { id: "fine-placement", title: "Fine Placement", description: lorem },
];
