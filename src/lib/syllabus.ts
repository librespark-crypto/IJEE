import type { SyllabusTopic } from "./types";

export const SYLLABUS_SOURCE = {
  title: "Latest officially published syllabi for the 2027 cycle",
  main: "NTA JEE Main 2026 syllabus (the 2024 revision, still the latest NTA document; the 2027 brochure is not out).",
  advanced: "JEE Advanced 2026 Information Brochure, Annexure-I, published by IIT Roorkee at jeeadv.ac.in. The 2027 brochure is not yet published; 2026 is the latest official syllabus.",
};

type Subject = SyllabusTopic["subject"];
type Exam = "JM" | "JA";

function topic(
  id: string,
  subject: Subject,
  unit: string,
  chapter: string,
  name: string,
  subtopics: string[],
  exams: Exam[],
  classLevel: 11 | 12,
): SyllabusTopic {
  return { id, subject, unit, chapter, topic: name, subtopics, exams, classLevel };
}

const both = ["JM", "JA"] as Exam[];
const jm = ["JM"] as Exam[];
const ja = ["JA"] as Exam[];

export const SYLLABUS: SyllabusTopic[] = [
  topic("phy-units", "Physics", "General", "Units and Measurements", "Units, dimensions and errors", ["SI units and prefixes", "Significant figures and least count", "Dimensional analysis and its limits", "Errors, accuracy and precision"], both, 11),
  topic("phy-exp-length", "Physics", "General", "Experimental Skills", "Length, g and elasticity experiments", ["Vernier callipers and screw gauge", "Simple pendulum for g", "Young’s modulus of a wire"], both, 11),
  topic("phy-exp-heat", "Physics", "General", "Experimental Skills", "Heat, optics and electricity experiments", ["Specific heat by calorimeter", "Focal length by u–v method", "Resonance column", "Ohm’s law, metre bridge and post office box"], both, 11),
  topic("phy-kin-1d", "Physics", "Mechanics", "Kinematics", "Motion in one dimension", ["Position, velocity and acceleration", "Constant-acceleration equations", "Graphs of motion"], both, 11),
  topic("phy-kin-2d", "Physics", "Mechanics", "Kinematics", "Motion in two dimensions", ["Projectile motion in Cartesian coordinates", "Relative velocity", "Uniform circular motion"], both, 11),
  topic("phy-laws", "Physics", "Mechanics", "Laws of Motion", "Newton’s laws and friction", ["Inertial and uniformly accelerated frames", "Static and kinetic friction", "Free-body diagrams and constraints"], both, 11),
  topic("phy-wep", "Physics", "Mechanics", "Work, Energy and Power", "Energy methods", ["Work by constant and variable forces", "Kinetic and potential energy", "Conservation of mechanical energy", "Power"], both, 11),
  topic("phy-com", "Physics", "Mechanics", "Systems of Particles", "Centre of mass and collisions", ["Centre of mass motion", "Impulse and linear momentum", "Elastic and inelastic collisions"], both, 11),
  topic("phy-rot-mi", "Physics", "Mechanics", "Rotational Motion", "Moment of inertia and torque", ["Parallel and perpendicular axis theorems", "MI of rings, discs, rods and spheres", "Torque and angular momentum"], both, 11),
  topic("phy-rot-dyn", "Physics", "Mechanics", "Rotational Motion", "Rigid-body dynamics", ["Fixed-axis rotation", "Rolling without slipping", "Equilibrium of rigid bodies", "Collision of a point mass with a rigid body"], both, 11),
  topic("phy-shm", "Physics", "Mechanics", "Oscillations", "Simple harmonic motion", ["Linear and angular SHM", "Spring and pendulum", "Energy in SHM"], both, 11),
  topic("phy-damped", "Physics", "Mechanics", "Oscillations", "Damped, forced oscillation and resonance", ["Damping in one dimension", "Forced oscillation", "Resonance"], both, 11),
  topic("phy-elastic", "Physics", "Mechanics", "Properties of Solids", "Elasticity", ["Hooke’s law", "Young’s modulus", "Bulk modulus and modulus of rigidity"], both, 11),
  topic("phy-grav", "Physics", "Mechanics", "Gravitation", "Field, potential and orbits", ["Newton’s law of gravitation", "Gravitational field and potential", "g and its variation", "Kepler’s laws, satellites, geostationary orbits and escape speed"], both, 11),
  topic("phy-fluid-static", "Physics", "Mechanics", "Fluids", "Fluid statics and surface tension", ["Pressure and Pascal’s law", "Buoyancy", "Surface energy, angle of contact, drops, bubbles and capillary rise"], both, 11),
  topic("phy-fluid-dyn", "Physics", "Mechanics", "Fluids", "Viscosity and Bernoulli", ["Stokes’ law and terminal velocity", "Streamline flow and continuity", "Bernoulli’s theorem and applications", "Poiseuille’s equation is excluded from JEE Advanced"], ja, 11),
  topic("phy-waves", "Physics", "Waves", "Waves", "Progressive and stationary waves", ["Longitudinal and transverse plane waves", "Superposition", "Strings and air columns", "Beats and resonance"], both, 11),
  topic("phy-sound", "Physics", "Waves", "Waves", "Sound and Doppler effect", ["Speed of sound in gases", "Doppler effect in sound"], both, 11),
  topic("phy-thermal-exp", "Physics", "Thermal Physics", "Thermal Properties", "Expansion, calorimetry and transfer", ["Thermal expansion of solids, liquids and gases", "Calorimetry and latent heat", "Conduction in one dimension", "Elementary convection and radiation", "Newton’s law of cooling"], both, 11),
  topic("phy-thermo", "Physics", "Thermal Physics", "Thermodynamics", "Laws of thermodynamics", ["Ideal gas, Cv and Cp for monoatomic and diatomic gases", "Isothermal and adiabatic processes", "First law for ideal gases", "Second law, reversible processes and Carnot efficiency"], both, 11),
  topic("phy-blackbody", "Physics", "Thermal Physics", "Radiation", "Blackbody radiation", ["Absorptive and emissive powers", "Kirchhoff’s law", "Wien’s displacement law", "Stefan’s law"], ja, 11),
  topic("phy-ktg", "Physics", "Thermal Physics", "Kinetic Theory", "Kinetic theory of gases", ["Ideal gas equation", "Pressure of an ideal gas", "RMS, average and most probable speeds", "Degrees of freedom and equipartition"], jm, 11),
  topic("phy-coulomb", "Physics", "Electricity and Magnetism", "Electrostatics", "Charge, field and potential", ["Coulomb’s law", "Electric field and potential", "Potential energy of point charges and dipoles", "Field lines and flux"], both, 12),
  topic("phy-gauss", "Physics", "Electricity and Magnetism", "Electrostatics", "Gauss’s law", ["Infinite line charge", "Infinite plane sheet", "Thin spherical shell"], both, 12),
  topic("phy-cap", "Physics", "Electricity and Magnetism", "Electrostatics", "Capacitors", ["Parallel-plate capacitor with and without dielectrics", "Series and parallel combinations", "Energy stored"], both, 12),
  topic("phy-current", "Physics", "Electricity and Magnetism", "Current Electricity", "Circuits and heating", ["Ohm’s law", "Series and parallel resistors and cells", "Kirchhoff’s laws", "Heating effect of current"], both, 12),
  topic("phy-biot", "Physics", "Electricity and Magnetism", "Magnetism", "Magnetic field of currents", ["Biot–Savart and Ampere’s law", "Straight wire, circular coil and long solenoid", "Force on a moving charge and on a current-carrying wire"], both, 12),
  topic("phy-galvo", "Physics", "Electricity and Magnetism", "Magnetism", "Current loops and instruments", ["Magnetic moment of a loop", "Torque on a loop", "Moving-coil galvanometer and conversion to ammeter and voltmeter"], both, 12),
  topic("phy-emi", "Physics", "Electricity and Magnetism", "Electromagnetic Induction", "Faraday and inductance", ["Faraday’s law and Lenz’s law", "Self and mutual inductance", "RC, LR, LC and series LCR with d.c. and a.c. sources"], both, 12),
  topic("phy-emw", "Physics", "Electricity and Magnetism", "Electromagnetic Waves", "Spectrum", ["Characteristics of electromagnetic waves", "Radio waves through gamma rays and elementary uses"], both, 12),
  topic("phy-ray", "Physics", "Optics", "Ray Optics", "Reflection and refraction", ["Rectilinear propagation", "Plane and spherical surfaces", "Total internal reflection", "Prism deviation and dispersion"], both, 12),
  topic("phy-lens", "Physics", "Optics", "Ray Optics", "Lenses and mirrors", ["Thin lenses", "Combinations of mirrors and thin lenses", "Magnification"], both, 12),
  topic("phy-wave-opt", "Physics", "Optics", "Wave Optics", "Interference, diffraction and polarisation", ["Huygens’ principle", "Young’s double slit", "Single-slit diffraction", "Brewster’s law and Polaroids"], both, 12),
  topic("phy-photo", "Physics", "Modern Physics", "Dual Nature", "Photoelectric effect and matter waves", ["Photoelectric equation and graphs", "de Broglie wavelength"], both, 12),
  topic("phy-atom", "Physics", "Modern Physics", "Atoms and Nuclei", "Bohr model and X-rays", ["Bohr theory of hydrogen-like atoms", "Characteristic and continuous X-rays", "Moseley’s law"], both, 12),
  topic("phy-nucleus", "Physics", "Modern Physics", "Atoms and Nuclei", "Nucleus and radioactivity", ["α, β and γ radiation", "Decay law, half-life and mean life", "Binding energy", "Fission and fusion energy calculations"], both, 12),
  topic("phy-semi", "Physics", "Electronic Devices", "Semiconductors", "Devices and logic", ["Energy bands, intrinsic and extrinsic semiconductors", "p–n junction and diode", "Zener, LED and photodiode", "Transistor action and logic gates"], jm, 12),

  topic("ch-mole", "Chemistry", "Physical", "Some Basic Concepts", "Mole concept and stoichiometry", ["Atoms, molecules and Dalton’s theory", "Chemical formulae and balanced equations", "Oxidation–reduction, neutralisation and displacement calculations", "Mole fraction, molarity, molality and normality"], both, 11),
  topic("ch-gas", "Chemistry", "Physical", "States of Matter", "Gases", ["Gas laws and ideal gas equation", "van der Waals equation", "Kinetic theory speeds", "Dalton’s law and diffusion"], ja, 11),
  topic("ch-liquid", "Chemistry", "Physical", "States of Matter", "Liquids", ["Intermolecular interactions", "Vapour pressure, surface tension and viscosity"], ja, 11),
  topic("ch-atom", "Chemistry", "Physical", "Atomic Structure", "Quantum picture of the atom", ["Bohr model and hydrogen spectrum", "de Broglie and uncertainty", "Quantum numbers and orbital shapes", "Aufbau, Pauli and Hund"], both, 11),
  topic("ch-bond", "Chemistry", "Physical", "Chemical Bonding", "Bonding and shape", ["Overlap, hybridisation of s, p and d", "VSEPR shapes", "Dipole moment and hydrogen bond", "MO diagrams of homonuclear diatomics up to Ne2"], both, 11),
  topic("ch-thermo", "Chemistry", "Physical", "Chemical Thermodynamics", "Energy, entropy and spontaneity", ["First law, enthalpy and heat capacity", "Hess’s law and lattice enthalpy", "Entropy and Gibbs energy", "Criteria of equilibrium and spontaneity"], both, 11),
  topic("ch-eq", "Chemistry", "Physical", "Equilibrium", "Chemical and ionic equilibrium", ["Kp, Kc and reaction quotient", "Le Chatelier’s principle", "Acids, bases and hydrolysis", "pH, buffers, solubility product and common-ion effect"], both, 11),
  topic("ch-electro", "Chemistry", "Physical", "Electrochemistry", "Cells and conductance", ["Electrode potentials and electrochemical series", "Nernst equation and emf", "Faraday’s laws", "Kohlrausch’s law, batteries, fuel cells and corrosion"], both, 12),
  topic("ch-kinetics", "Chemistry", "Physical", "Chemical Kinetics", "Rate laws", ["Order, molecularity and half-life", "Zero and first order integrated laws", "Arrhenius equation", "Homogeneous, heterogeneous and enzyme catalysis"], both, 12),
  topic("ch-solid", "Chemistry", "Physical", "Solid State", "Crystals and defects", ["Seven crystal systems", "fcc, bcc and hcp packing", "Radius ratio and nearest neighbours", "Point defects"], ja, 12),
  topic("ch-solution", "Chemistry", "Physical", "Solutions", "Colligative properties", ["Henry’s law and Raoult’s law", "Ideal solutions", "Vapour pressure, boiling point, freezing point and osmotic pressure", "van’t Hoff factor"], both, 12),
  topic("ch-surface", "Chemistry", "Physical", "Surface Chemistry", "Adsorption and colloids", ["Physisorption, chemisorption and Freundlich isotherm", "Colloid types and preparation", "Emulsions, surfactants and micelles — definitions and examples"], ja, 12),
  topic("ch-periodic", "Chemistry", "Inorganic", "Periodicity", "Periodic trends", ["Modern periodic law", "Electronic configuration", "Radius, ionisation enthalpy, electron gain enthalpy, electronegativity and oxidation states"], both, 11),
  topic("ch-hydrogen", "Chemistry", "Inorganic", "Hydrogen", "Hydrogen and its compounds", ["Isotopes, preparation and uses", "Ionic, covalent and interstitial hydrides", "Water, heavy water and hydrogen peroxide", "Hydrogen as a fuel"], ja, 11),
  topic("ch-sblock", "Chemistry", "Inorganic", "s-Block Elements", "Alkali and alkaline earth metals", ["Reactivity and reducing nature", "Oxides, hydroxides, halides and oxoacid salts", "Anomalous Li and Be", "Sodium carbonate, NaOH, NaHCO3 and calcium compounds"], ja, 11),
  topic("ch-p-13", "Chemistry", "Inorganic", "p-Block Elements", "Groups 13 and 14", ["Oxidation states and anomalous B, C, N, O, F", "Borax, boric acid, diborane, BF3, AlCl3 and alums", "CO, CO2, SiO2, silicones, silicates and zeolites"], both, 11),
  topic("ch-p-15", "Chemistry", "Inorganic", "p-Block Elements", "Group 15", ["Allotropes of phosphorus", "N2, NH3, HNO3 and phosphine", "PCl3, PCl5, oxides of nitrogen and oxoacids of phosphorus"], both, 12),
  topic("ch-p-16", "Chemistry", "Inorganic", "p-Block Elements", "Groups 16, 17 and 18", ["O2, ozone, SO2, sulfuric acid and oxoacids of sulphur", "Chlorine, HCl, interhalogens and bleaching powder", "Xenon fluorides and oxides"], both, 12),
  topic("ch-dblock", "Chemistry", "Inorganic", "d- and f-Block Elements", "Transition and inner transition elements", ["Oxidation states and electrode potentials", "Interstitial compounds, alloys and catalysis", "Oxoanions of Cr and Mn", "Lanthanoid and actinoid contraction"], both, 12),
  topic("ch-coord", "Chemistry", "Inorganic", "Coordination Compounds", "Bonding, colour and isomerism", ["Werner’s theory and nomenclature", "cis-trans and ionisation isomerism", "VBT and CFT for octahedral and tetrahedral fields", "Spin-only magnetism, spectrochemical series and metal carbonyls"], both, 12),
  topic("ch-metallurgy", "Chemistry", "Inorganic", "Isolation of Metals", "Extraction and refining", ["Concentration of ores", "Thermodynamic extraction of Fe, Cu and Zn", "Electrochemical extraction of Al", "Cyanide process and refining"], ja, 12),
  topic("ch-salt", "Chemistry", "Inorganic", "Qualitative Analysis", "Cations and anions", ["Groups I to V for the listed cations only", "Nitrate, halide except fluoride, carbonate, bicarbonate, sulphate and sulphide"], ja, 12),
  topic("ch-env", "Chemistry", "Inorganic", "Environmental Chemistry", "Pollution and green chemistry", ["Atmospheric, water and soil pollution", "Industrial waste", "Control strategies and green chemistry"], ja, 12),
  topic("ch-goc", "Chemistry", "Organic", "Basic Principles", "Structure, nomenclature and effects", ["Hybridisation, σ and π bonds, aromaticity", "Structural and geometrical isomerism; stereoisomers up to two centres, R/S and E/Z excluded", "IUPAC of hydrocarbons and simple mono- and bi-functional derivatives", "Inductive, resonance and hyperconjugation effects", "Acidity, basicity, carbocations, carbanions and radicals"], both, 11),
  topic("ch-purify", "Chemistry", "Organic", "Purification and Characterisation", "Separation and analysis", ["Crystallisation, distillation, chromatography", "Qualitative detection of elements", "Quantitative estimation used in JEE Main practical chemistry"], jm, 11),
  topic("ch-alkane", "Chemistry", "Organic", "Hydrocarbons", "Alkanes", ["Physical properties and branching", "Newman projections of ethane and butane", "Preparation and halogenation, including allylic and benzylic", "Combustion and oxidation"], both, 11),
  topic("ch-alkene", "Chemistry", "Organic", "Hydrocarbons", "Alkenes and alkynes", ["Elimination preparation and acid-catalysed hydration", "Electrophilic addition of X2, HX and HOX", "Peroxide effect, KMnO4 and ozonolysis", "Metal acetylides and reduction"], both, 11),
  topic("ch-benzene", "Chemistry", "Organic", "Hydrocarbons", "Benzene", ["Electrophilic substitution: halogenation, nitration, sulphonation, Friedel–Crafts", "Directing effects in monosubstituted benzene"], both, 11),
  topic("ch-halide", "Chemistry", "Organic", "Organic Halogen Compounds", "Alkyl halides and haloarenes", ["Nucleophilic substitution and stereochemistry", "Carbocation rearrangement and Grignard reactions", "Fittig and Wurtz–Fittig", "Nucleophilic aromatic substitution, excluding benzyne and cine substitution"], both, 12),
  topic("ch-phenol", "Chemistry", "Organic", "Oxygen Compounds", "Phenols", ["Electrophilic substitution", "Reimer–Tiemann and Kolbe", "Esterification, etherification and aspirin", "Oxidation and reduction"], both, 12),
  topic("ch-alcohol", "Chemistry", "Organic", "Oxygen Compounds", "Alcohols and ethers", ["Esterification and dehydration", "PX3, ZnCl2/HCl and SOCl2", "Oxidation to carbonyls and acids", "Williamson synthesis and C–O cleavage"], both, 12),
  topic("ch-carbonyl", "Chemistry", "Organic", "Oxygen Compounds", "Aldehydes and ketones", ["Preparation from acid chlorides, nitriles and esters", "Nucleophilic addition", "Oxime and hydrazone", "Aldol, Cannizzaro and haloform"], both, 12),
  topic("ch-acid", "Chemistry", "Organic", "Oxygen Compounds", "Carboxylic acids", ["Preparation from nitriles, Grignard reagents, esters and amides", "Benzoic acid from alkylbenzenes", "Reduction, halogenation, esters, acid chlorides and amides"], both, 12),
  topic("ch-amine", "Chemistry", "Organic", "Nitrogen Compounds", "Amines and diazonium salts", ["Preparation from nitro compounds, nitriles and amides", "Hoffmann bromamide and Gabriel synthesis", "Hinsberg and carbylamine tests", "Sandmeyer and azo coupling"], both, 12),
  topic("ch-bio", "Chemistry", "Organic", "Biomolecules", "Carbohydrates, proteins and nucleic acids", ["Glucose, sucrose, maltose and lactose", "Anomers, glycosides and hydrolysis", "Amino acids, peptide bond, primary and secondary structure", "DNA and RNA composition"], both, 12),
  topic("ch-polymer", "Chemistry", "Organic", "Polymers", "Polymer types and uses", ["Addition and condensation", "Homo and copolymers", "Natural rubber, cellulose, nylon, Teflon, Bakelite, PVC", "Biodegradable polymers"], ja, 12),
  topic("ch-everyday", "Chemistry", "Organic", "Chemistry in Everyday Life", "Drugs and cleansing", ["Drug–target interaction", "Named drug classes, structures excluded", "Artificial sweeteners by name", "Soaps, detergents and cleansing action"], ja, 12),
  topic("ch-practical-org", "Chemistry", "Organic", "Practical Organic Chemistry", "Detection", ["N, S and halogen detection", "Alcoholic and phenolic OH, carbonyl, carboxyl, amino and nitro groups"], both, 12),

  topic("ma-sets", "Mathematics", "Algebra", "Sets, Relations and Functions", "Sets and relations", ["Algebra of sets and De Morgan’s laws", "Cartesian product and equivalence relations", "Domain and codomain"], both, 11),
  topic("ma-func", "Mathematics", "Algebra", "Sets, Relations and Functions", "Functions", ["One-one, onto and invertible functions", "Even and odd functions", "Polynomial, trigonometric, exponential, logarithmic, absolute value and greatest integer functions", "Composition of functions"], both, 11),
  topic("ma-complex", "Mathematics", "Algebra", "Complex Numbers and Quadratics", "Complex numbers", ["Algebra, conjugate and modulus", "Polar form and argument", "Triangle inequality and cube roots of unity"], both, 11),
  topic("ma-quad", "Mathematics", "Algebra", "Complex Numbers and Quadratics", "Quadratic equations", ["Fundamental theorem of algebra as a statement", "Roots and coefficients", "Symmetric functions of roots"], both, 11),
  topic("ma-prog", "Mathematics", "Algebra", "Sequence and Series", "Progressions", ["Arithmetic and geometric progressions and means", "Finite and infinite geometric series", "Sums of first n naturals, squares and cubes"], both, 11),
  topic("ma-log", "Mathematics", "Algebra", "Sequence and Series", "Logarithms", ["Laws of logarithms", "Change of base and simple equations"], both, 11),
  topic("ma-pnc", "Mathematics", "Algebra", "Permutations and Combinations", "Counting", ["Fundamental principle", "Permutations and combinations", "Simple applications"], both, 11),
  topic("ma-binomial", "Mathematics", "Algebra", "Binomial Theorem", "Positive integral index", ["General term", "Properties of binomial coefficients"], both, 11),
  topic("ma-matrix", "Mathematics", "Algebra", "Matrices and Determinants", "Matrix algebra", ["Addition, scalar multiplication and product", "Transpose", "Elementary row and column operations", "Symmetric and skew-symmetric matrices"], both, 12),
  topic("ma-det", "Mathematics", "Algebra", "Matrices and Determinants", "Determinants and linear equations", ["Determinant and adjoint up to order three", "Inverse up to order three", "Two and three variable linear systems"], both, 12),
  topic("ma-prob", "Mathematics", "Algebra", "Probability", "Conditional probability", ["Addition and multiplication rules", "Independence", "Total probability and Bayes’ theorem", "Counting-based probability"], both, 12),
  topic("ma-stats", "Mathematics", "Algebra", "Statistics", "Dispersion", ["Mean, median and mode", "Mean deviation, variance and standard deviation", "Grouped and ungrouped data", "Random variable mean and variance"], both, 12),
  topic("ma-trig", "Mathematics", "Trigonometry", "Trigonometric Functions", "Identities and equations", ["Periodicity and graphs", "Addition and multiple-angle formulae", "General solution of trigonometric equations"], both, 11),
  topic("ma-invtrig", "Mathematics", "Trigonometry", "Inverse Trigonometric Functions", "Principal values", ["Principal value branches", "Elementary properties"], both, 12),
  topic("ma-line", "Mathematics", "Coordinate Geometry", "Straight Lines", "Lines in a plane", ["Forms of a line", "Angle, distance and family of lines", "Angle bisectors and concurrency", "Centroid, orthocentre, incentre and circumcentre"], both, 11),
  topic("ma-circle", "Mathematics", "Coordinate Geometry", "Circle", "Circles", ["Standard and general equation", "Tangent, normal and chord", "Parametric form", "Intersection with a line or another circle"], both, 11),
  topic("ma-conic", "Mathematics", "Coordinate Geometry", "Conic Sections", "Parabola, ellipse and hyperbola", ["Standard forms, foci, directrices and eccentricity", "Parametric equations", "Tangents and normals", "Locus problems"], both, 11),
  topic("ma-3d", "Mathematics", "Coordinate Geometry", "Three-Dimensional Geometry", "Lines and planes", ["Direction cosines and ratios", "Equation of a line and skew lines", "Shortest distance", "Equation of a plane and angles between lines and planes"], both, 12),
  topic("ma-vector", "Mathematics", "Vectors", "Vector Algebra", "Products", ["Addition and components", "Scalar product", "Vector product", "Applications in geometry"], both, 12),
  topic("ma-limit", "Mathematics", "Calculus", "Limits and Continuity", "Limits", ["Limit at a real number", "Algebra of limits", "L’Hospital’s rule", "Continuity and intermediate value property"], both, 12),
  topic("ma-diff", "Mathematics", "Calculus", "Differential Calculus", "Differentiation", ["Sum, product, quotient and chain rule", "Polynomial, rational, trigonometric, inverse trigonometric, exponential and logarithmic derivatives", "Implicit functions up to order two"], both, 12),
  topic("ma-aod", "Mathematics", "Calculus", "Differential Calculus", "Applications of derivatives", ["Tangents and normals", "Increasing and decreasing functions", "Maxima and minima", "Rolle’s theorem and Lagrange’s mean value theorem"], both, 12),
  topic("ma-indef", "Mathematics", "Calculus", "Integral Calculus", "Indefinite integrals", ["Integration as inverse differentiation", "Standard integrals", "Substitution, parts and partial fractions"], both, 12),
  topic("ma-def", "Mathematics", "Calculus", "Integral Calculus", "Definite integrals", ["Definite integral as a limit of sums", "Properties and the fundamental theorem", "Area under curves"], both, 12),
  topic("ma-de", "Mathematics", "Calculus", "Differential Equations", "First-order equations", ["Order and degree", "Separation of variables", "Homogeneous equations", "Linear equations dy/dx + P(x)y = Q(x)"], both, 12),
];

export function syllabusBySubject(subject: Subject) {
  return SYLLABUS.filter((item) => item.subject === subject);
}

export function chaptersOf(subject: Subject) {
  const chapters: { chapter: string; unit: string; topics: SyllabusTopic[] }[] = [];
  for (const item of syllabusBySubject(subject)) {
    const last = chapters[chapters.length - 1];
    if (!last || last.chapter !== item.chapter) chapters.push({ chapter: item.chapter, unit: item.unit, topics: [item] });
    else last.topics.push(item);
  }
  return chapters;
}
