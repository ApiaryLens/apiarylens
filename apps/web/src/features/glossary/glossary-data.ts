export interface GlossaryEntry {
  id: string;
  term: string;
  aliases: readonly string[];
  category: string;
  definition: string;
}

export const glossaryCategories = [
  'Hive components',
  'Colony and brood',
  'Inspections',
  'Health and pests',
  'Feeding',
  'Treatments',
  'Harvest',
] as const;

export const glossaryEntries: readonly GlossaryEntry[] = [
  {
    id: 'brood-box',
    term: 'Brood box (deep)',
    aliases: ['deep', 'brood chamber', 'hive body'],
    category: 'Hive components',
    definition:
      'The larger box, usually at the bottom of the stack, where the queen lays eggs and the colony raises brood. Many hives use one or two brood boxes below any supers.',
  },
  {
    id: 'super',
    term: 'Super',
    aliases: ['honey super', 'medium', 'shallow'],
    category: 'Hive components',
    definition:
      'A box added above the brood nest for the colony to store surplus honey. Mediums and shallows are common super sizes because full deeps of honey are very heavy.',
  },
  {
    id: 'frame',
    term: 'Frame',
    aliases: ['foundation'],
    category: 'Hive components',
    definition:
      'The removable wooden or plastic rectangle bees build comb on. Foundation is the starter sheet of wax or plastic inside a frame that guides straight comb.',
  },
  {
    id: 'queen-excluder',
    term: 'Queen excluder',
    aliases: ['excluder'],
    category: 'Hive components',
    definition:
      'A grid placed between the brood boxes and supers whose openings let workers through but not the larger queen, keeping brood out of honey supers.',
  },
  {
    id: 'bottom-board',
    term: 'Bottom board',
    aliases: ['screened bottom board'],
    category: 'Hive components',
    definition:
      'The floor of the hive. A screened bottom board adds ventilation and lets fallen varroa mites drop out, which also supports sticky-board mite monitoring.',
  },
  {
    id: 'inner-cover',
    term: 'Inner cover',
    aliases: [],
    category: 'Hive components',
    definition:
      'The flat cover directly on the top box, under the outer cover. It prevents bees from gluing the roof down and provides ventilation and feeding access.',
  },
  {
    id: 'outer-cover',
    term: 'Outer (telescoping) cover',
    aliases: ['telescoping cover', 'roof'],
    category: 'Hive components',
    definition:
      'The weatherproof roof of the hive. A telescoping cover hangs over the edges of the top box to shed rain.',
  },
  {
    id: 'entrance-reducer',
    term: 'Entrance reducer',
    aliases: ['mouse guard'],
    category: 'Hive components',
    definition:
      'A strip that narrows the hive entrance so a small or new colony can defend itself against robbing, and keeps mice out in cold weather.',
  },
  {
    id: 'nuc',
    term: 'Nucleus colony (nuc)',
    aliases: ['nucleus'],
    category: 'Hive components',
    definition:
      'A small starter colony, usually five frames of bees, brood, stores, and a laying queen, used to start or requeen a full hive.',
  },
  {
    id: 'feeder',
    term: 'Feeder',
    aliases: ['frame feeder', 'top feeder', 'entrance feeder'],
    category: 'Hive components',
    definition:
      'Equipment that holds sugar syrup or other feed inside or on the hive so the colony can take it without leaving the stack.',
  },
  {
    id: 'queen',
    term: 'Queen',
    aliases: [],
    category: 'Colony and brood',
    definition:
      'The single reproductive female in the colony. She lays the eggs and her pheromones hold the colony together; her presence and laying pattern are core inspection checks.',
  },
  {
    id: 'worker',
    term: 'Worker bee',
    aliases: [],
    category: 'Colony and brood',
    definition:
      'A non-reproductive female bee. Workers do everything except lay fertilized eggs: nursing, comb building, guarding, and foraging.',
  },
  {
    id: 'drone',
    term: 'Drone',
    aliases: [],
    category: 'Colony and brood',
    definition:
      'A male bee. Drones exist to mate with queens from other colonies and are often evicted before winter. Patches of drone comb are normal in season.',
  },
  {
    id: 'brood',
    term: 'Brood',
    aliases: ['brood pattern', 'brood nest'],
    category: 'Colony and brood',
    definition:
      'The developing bees: eggs, larvae, and pupae. A solid, consistent brood pattern usually signals a healthy laying queen; a spotty pattern is worth investigating.',
  },
  {
    id: 'capped-brood',
    term: 'Capped brood',
    aliases: [],
    category: 'Colony and brood',
    definition:
      'Pupating brood sealed under tan, slightly domed wax cappings. Worker brood is capped for about 12 days before the adult bee emerges.',
  },
  {
    id: 'eggs-larvae',
    term: 'Eggs and larvae',
    aliases: ['eggs', 'larvae', 'open brood'],
    category: 'Colony and brood',
    definition:
      'The youngest brood stages. Seeing eggs or young larvae proves a queen laid within roughly the last three days, even when you do not spot the queen herself.',
  },
  {
    id: 'queenright',
    term: 'Queenright / queenless',
    aliases: ['queenless'],
    category: 'Colony and brood',
    definition:
      'A queenright colony has a functioning laying queen. A queenless colony has lost her — signs include no eggs, a shrinking brood nest, emergency queen cells, and a restless roar.',
  },
  {
    id: 'supersedure',
    term: 'Supersedure',
    aliases: ['supersedure cell'],
    category: 'Colony and brood',
    definition:
      'The colony replacing its own queen without swarming, usually raising a few queen cells on the comb face. ApiaryLens keeps the replaced queen in the hive history.',
  },
  {
    id: 'swarm',
    term: 'Swarm',
    aliases: ['swarm cell'],
    category: 'Colony and brood',
    definition:
      'Colony reproduction: the old queen leaves with roughly half the bees. Queen cells along the bottom of frames in a crowded spring hive are the classic warning.',
  },
  {
    id: 'queen-marking',
    term: 'Queen marking colors',
    aliases: ['marked queen', 'marking color'],
    category: 'Colony and brood',
    definition:
      'A paint dot that makes the queen easier to find and dates her. The international five-color cycle is: years ending 1/6 white, 2/7 yellow, 3/8 red, 4/9 green, 5/0 blue.',
  },
  {
    id: 'inspection',
    term: 'Inspection',
    aliases: ['hive inspection'],
    category: 'Inspections',
    definition:
      'A structured look through the hive to confirm the queen is laying, brood is healthy, stores are adequate, and there is room to grow. ApiaryLens drafts let you record in the yard and finish later.',
  },
  {
    id: 'temperament',
    term: 'Temperament',
    aliases: ['defensive'],
    category: 'Inspections',
    definition:
      'How the colony behaves when opened, from calm to defensive. A normally gentle colony turning defensive can signal queenlessness, a dearth, or robbing pressure.',
  },
  {
    id: 'stores',
    term: 'Stores',
    aliases: ['honey stores', 'winter stores'],
    category: 'Inspections',
    definition:
      'The honey and pollen the colony keeps to feed itself. Recording stores at each inspection shows whether the colony needs feeding or has surplus to harvest.',
  },
  {
    id: 'varroa-mite',
    term: 'Varroa mite',
    aliases: ['varroa', 'mite'],
    category: 'Health and pests',
    definition:
      'A parasitic mite that feeds on bees and spreads viruses; the leading cause of colony loss in most regions. Regular counts and timely treatment keep it below damaging levels.',
  },
  {
    id: 'alcohol-wash',
    term: 'Alcohol wash / sugar roll',
    aliases: ['sugar roll', 'mite wash', 'mite count', 'sticky board'],
    category: 'Health and pests',
    definition:
      'Methods for measuring varroa infestation from a sample of about 300 nurse bees. The result is usually read as mites per 100 bees; sticky boards under a screened floor measure natural mite drop instead.',
  },
  {
    id: 'chalkbrood',
    term: 'Chalkbrood',
    aliases: [],
    category: 'Health and pests',
    definition:
      'A fungal brood disease that leaves hard white or gray “mummies” in cells and on the bottom board. Usually stress-related; strong colonies and good ventilation help.',
  },
  {
    id: 'american-foulbrood',
    term: 'American foulbrood (AFB)',
    aliases: ['AFB', 'foulbrood', 'european foulbrood'],
    category: 'Health and pests',
    definition:
      'A serious bacterial brood disease with sunken, perforated cappings and a ropey, foul-smelling larval remain. Many regions require reporting it; follow local law before acting.',
  },
  {
    id: 'nosema',
    term: 'Nosema',
    aliases: [],
    category: 'Health and pests',
    definition:
      'A gut parasite of adult bees that weakens colonies, most visibly in late winter and spring. Dysentery streaking at the entrance can be a sign, though only lab testing confirms it.',
  },
  {
    id: 'small-hive-beetle',
    term: 'Small hive beetle',
    aliases: ['SHB'],
    category: 'Health and pests',
    definition:
      'A scavenging beetle whose larvae ferment stored honey and comb. Strong colonies patrol and contain beetles; weak or over-supered hives are vulnerable.',
  },
  {
    id: 'wax-moth',
    term: 'Wax moth',
    aliases: [],
    category: 'Health and pests',
    definition:
      'Moths whose larvae tunnel through comb, ruining it with webbing and debris. Mostly a threat to weak colonies and unprotected stored equipment.',
  },
  {
    id: 'robbing',
    term: 'Robbing',
    aliases: [],
    category: 'Health and pests',
    definition:
      'Bees from stronger colonies stealing honey from weaker ones, common during a nectar dearth. Fighting at the entrance and frantic flight are typical signs; reduce entrances to help defense.',
  },
  {
    id: 'sugar-syrup',
    term: 'Sugar syrup (1:1 and 2:1)',
    aliases: ['1:1 syrup', '2:1 syrup', 'syrup'],
    category: 'Feeding',
    definition:
      'Sugar dissolved in water by weight. Thin 1:1 syrup mimics nectar and stimulates spring buildup and comb building; thick 2:1 syrup is fall feed the bees store for winter.',
  },
  {
    id: 'pollen-patty',
    term: 'Pollen patty',
    aliases: ['pollen substitute'],
    category: 'Feeding',
    definition:
      'A protein supplement placed over the brood nest to support brood rearing when natural pollen is scarce, typically in late winter or early spring.',
  },
  {
    id: 'fondant',
    term: 'Fondant',
    aliases: ['candy board', 'dry sugar'],
    category: 'Feeding',
    definition:
      'Solid sugar feed placed directly above the cluster for emergency winter feeding, when the bees cannot take or ripen liquid syrup.',
  },
  {
    id: 'oxalic-acid',
    term: 'Oxalic acid',
    aliases: ['OA', 'oxalic acid vaporization', 'dribble'],
    category: 'Treatments',
    definition:
      'An organic varroa treatment applied by vaporization or dribble, most effective when the colony has little or no capped brood. Always follow the product label and local regulations.',
  },
  {
    id: 'formic-acid',
    term: 'Formic acid',
    aliases: ['formic pro', 'MAQS'],
    category: 'Treatments',
    definition:
      'An organic varroa treatment that penetrates cappings to reach mites in brood. Temperature-sensitive — apply within the label’s temperature range.',
  },
  {
    id: 'withdrawal-period',
    term: 'Withdrawal period (honey restrictions)',
    aliases: ['restrictions', 'supers off'],
    category: 'Treatments',
    definition:
      'The label-defined time a treatment must be kept away from honey intended for people — often stated as “supers off.” Record it with each treatment so harvests stay safe and legal.',
  },
  {
    id: 'honey-harvest',
    term: 'Honey harvest',
    aliases: ['harvest'],
    category: 'Harvest',
    definition:
      'Removing surplus honey the colony can spare. Harvest only capped, ripe frames and leave the colony enough stores for the season ahead.',
  },
  {
    id: 'extraction',
    term: 'Extraction',
    aliases: ['extractor'],
    category: 'Harvest',
    definition:
      'Spinning uncapped frames in an extractor so honey leaves the comb intact, letting you return drawn comb to the hive for the bees to refill.',
  },
  {
    id: 'cappings',
    term: 'Cappings',
    aliases: ['capped honey', 'uncapping'],
    category: 'Harvest',
    definition:
      'The thin wax seal bees place over ripened honey. Mostly capped frames indicate the honey is dry enough to harvest without fermenting; the cut cappings render into clean wax.',
  },
];
