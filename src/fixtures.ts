import type { FieldProfile, OemTarget, PreviousCrop, SoilZone, StateCode } from "./domain";

export type YieldRecordFixture = {
  seasonYear: number;
  yieldBuPerAcre: number;
  source: "combine_monitor" | "crop_insurance" | "operator_entry";
};

export type CanonicalFieldFixture = {
  id: string;
  farmId: string;
  displayName: string;
  synthetic: true;
  oemTarget: OemTarget;
  profile: FieldProfile;
  zones: SoilZone[];
  soilTest: {
    sampledAt: string;
    labName: string;
  };
  yieldRecords: YieldRecordFixture[];
  expected: {
    weightedNitrogenLbsPerAcreBand: [number, number];
    dollarsSavedPerAcreBand: [number, number];
    peerComparableCount: number;
    peerMediansVisible: boolean;
    guaranteeTriggerHarvestYield: number;
    vrtDbfFields: string[];
  };
};

export type CanonicalFarmFixture = {
  id: string;
  displayName: string;
  ownerName: string;
  state: StateCode;
  county: string;
  synthetic: true;
  fields: CanonicalFieldFixture[];
};

export type PeerCaseFixture = {
  state: StateCode;
  county: string;
  soilType: string;
  acres: number;
  organicMatterPct?: number;
  ph?: number;
  phosphorusPpm?: number;
  potassiumPpm?: number;
  appliedNitrogenRate: number;
  yield: number;
  savingsPerAcre: number;
};

export const peerCases: PeerCaseFixture[] = [
  { state: "MO", county: "Boone", soilType: "silt_loam", acres: 82, appliedNitrogenRate: 158, yield: 214, savingsPerAcre: 24 },
  { state: "MO", county: "Boone", soilType: "silt_loam", acres: 76, appliedNitrogenRate: 162, yield: 211, savingsPerAcre: 22 },
  { state: "MO", county: "Boone", soilType: "silt_loam", acres: 95, appliedNitrogenRate: 155, yield: 216, savingsPerAcre: 26 },
  { state: "MO", county: "Boone", soilType: "silt_loam", acres: 68, appliedNitrogenRate: 166, yield: 209, savingsPerAcre: 19 },
  { state: "MO", county: "Boone", soilType: "silt_loam", acres: 88, appliedNitrogenRate: 159, yield: 212, savingsPerAcre: 25 },
  { state: "MO", county: "Callaway", soilType: "clay_loam", acres: 58, appliedNitrogenRate: 166, yield: 204, savingsPerAcre: 17 },
  { state: "MO", county: "Callaway", soilType: "clay_loam", acres: 66, appliedNitrogenRate: 169, yield: 207, savingsPerAcre: 18 },
  { state: "MO", county: "Callaway", soilType: "clay_loam", acres: 72, appliedNitrogenRate: 164, yield: 202, savingsPerAcre: 15 },
  { state: "MO", county: "Callaway", soilType: "clay_loam", acres: 91, appliedNitrogenRate: 168, yield: 205, savingsPerAcre: 16 },
  { state: "MO", county: "Audrain", soilType: "loam", acres: 80, appliedNitrogenRate: 151, yield: 207, savingsPerAcre: 18 },
  { state: "MO", county: "Audrain", soilType: "loam", acres: 96, appliedNitrogenRate: 153, yield: 210, savingsPerAcre: 20 },
  { state: "MO", county: "Audrain", soilType: "loam", acres: 78, appliedNitrogenRate: 149, yield: 205, savingsPerAcre: 17 },
  { state: "MO", county: "Cooper", soilType: "sandy_loam", acres: 58, appliedNitrogenRate: 145, yield: 196, savingsPerAcre: 13 },
  { state: "MO", county: "Cooper", soilType: "sandy_loam", acres: 66, appliedNitrogenRate: 148, yield: 199, savingsPerAcre: 14 },
  { state: "MO", county: "Saline", soilType: "silty_clay_loam", acres: 92, appliedNitrogenRate: 164, yield: 218, savingsPerAcre: 21 },
  { state: "MO", county: "Saline", soilType: "silty_clay_loam", acres: 104, appliedNitrogenRate: 161, yield: 216, savingsPerAcre: 23 },
  { state: "MO", county: "Saline", soilType: "silty_clay_loam", acres: 86, appliedNitrogenRate: 166, yield: 213, savingsPerAcre: 20 },
  { state: "MO", county: "Saline", soilType: "silty_clay_loam", acres: 118, appliedNitrogenRate: 160, yield: 220, savingsPerAcre: 24 },
  { state: "MO", county: "Saline", soilType: "silty_clay_loam", acres: 96, appliedNitrogenRate: 163, yield: 215, savingsPerAcre: 22 },
  { state: "IA", county: "Story", soilType: "silt_loam", acres: 74, organicMatterPct: 2.7, ph: 6.3, phosphorusPpm: 18, potassiumPpm: 132, appliedNitrogenRate: 151, yield: 215, savingsPerAcre: 22 },
  { state: "IA", county: "Story", soilType: "silt_loam", acres: 86, organicMatterPct: 3.1, ph: 6.5, phosphorusPpm: 24, potassiumPpm: 156, appliedNitrogenRate: 148, yield: 218, savingsPerAcre: 24 },
  { state: "IA", county: "Story", soilType: "silt_loam", acres: 92, organicMatterPct: 3.8, ph: 6.8, phosphorusPpm: 31, potassiumPpm: 184, appliedNitrogenRate: 145, yield: 221, savingsPerAcre: 27 },
  { state: "IA", county: "Story", soilType: "silt_loam", acres: 105, organicMatterPct: 4.2, ph: 7.1, phosphorusPpm: 38, potassiumPpm: 205, appliedNitrogenRate: 149, yield: 219, savingsPerAcre: 25 },
  { state: "IA", county: "Story", soilType: "silt_loam", acres: 68, organicMatterPct: 2.4, ph: 6.1, phosphorusPpm: 16, potassiumPpm: 128, appliedNitrogenRate: 154, yield: 212, savingsPerAcre: 20 },
  { state: "IA", county: "Story", soilType: "silt_loam", acres: 118, organicMatterPct: 3.5, ph: 6.6, phosphorusPpm: 28, potassiumPpm: 176, appliedNitrogenRate: 147, yield: 220, savingsPerAcre: 26 },
  { state: "IL", county: "McLean", soilType: "silty_clay_loam", acres: 79, organicMatterPct: 2.3, ph: 6.2, phosphorusPpm: 14, potassiumPpm: 126, appliedNitrogenRate: 146, yield: 216, savingsPerAcre: 23 },
  { state: "IL", county: "McLean", soilType: "silty_clay_loam", acres: 94, organicMatterPct: 2.9, ph: 6.5, phosphorusPpm: 18, potassiumPpm: 144, appliedNitrogenRate: 142, yield: 219, savingsPerAcre: 25 },
  { state: "IL", county: "McLean", soilType: "silty_clay_loam", acres: 112, organicMatterPct: 3.4, ph: 6.7, phosphorusPpm: 21, potassiumPpm: 158, appliedNitrogenRate: 139, yield: 222, savingsPerAcre: 27 },
  { state: "IL", county: "McLean", soilType: "silty_clay_loam", acres: 87, organicMatterPct: 3.9, ph: 7.0, phosphorusPpm: 25, potassiumPpm: 172, appliedNitrogenRate: 141, yield: 220, savingsPerAcre: 26 },
  { state: "IL", county: "McLean", soilType: "silty_clay_loam", acres: 73, organicMatterPct: 2.1, ph: 6.0, phosphorusPpm: 12, potassiumPpm: 118, appliedNitrogenRate: 150, yield: 213, savingsPerAcre: 21 },
  { state: "IL", county: "McLean", soilType: "silty_clay_loam", acres: 126, organicMatterPct: 3.2, ph: 6.6, phosphorusPpm: 19, potassiumPpm: 151, appliedNitrogenRate: 144, yield: 218, savingsPerAcre: 24 },
  { state: "IN", county: "Benton", soilType: "loam", acres: 64, organicMatterPct: 1.8, ph: 6.0, phosphorusPpm: 13, potassiumPpm: 116, appliedNitrogenRate: 149, yield: 204, savingsPerAcre: 19 },
  { state: "IN", county: "Benton", soilType: "loam", acres: 78, organicMatterPct: 2.2, ph: 6.2, phosphorusPpm: 17, potassiumPpm: 136, appliedNitrogenRate: 145, yield: 208, savingsPerAcre: 21 },
  { state: "IN", county: "Benton", soilType: "loam", acres: 89, organicMatterPct: 2.9, ph: 6.5, phosphorusPpm: 22, potassiumPpm: 154, appliedNitrogenRate: 141, yield: 211, savingsPerAcre: 23 },
  { state: "IN", county: "Benton", soilType: "loam", acres: 101, organicMatterPct: 3.5, ph: 6.8, phosphorusPpm: 28, potassiumPpm: 178, appliedNitrogenRate: 138, yield: 214, savingsPerAcre: 25 },
  { state: "IN", county: "Benton", soilType: "loam", acres: 72, organicMatterPct: 1.6, ph: 5.9, phosphorusPpm: 11, potassiumPpm: 108, appliedNitrogenRate: 152, yield: 202, savingsPerAcre: 17 },
  { state: "IN", county: "Benton", soilType: "loam", acres: 116, organicMatterPct: 2.6, ph: 6.4, phosphorusPpm: 20, potassiumPpm: 148, appliedNitrogenRate: 143, yield: 209, savingsPerAcre: 22 },
  { state: "IA", county: "Polk", soilType: "clay_loam", acres: 68, organicMatterPct: 2.1, ph: 6.0, phosphorusPpm: 17, potassiumPpm: 134, appliedNitrogenRate: 150, yield: 207, savingsPerAcre: 19 },
  { state: "IA", county: "Polk", soilType: "clay_loam", acres: 78, organicMatterPct: 2.5, ph: 6.2, phosphorusPpm: 21, potassiumPpm: 148, appliedNitrogenRate: 148, yield: 210, savingsPerAcre: 21 },
  { state: "IA", county: "Polk", soilType: "clay_loam", acres: 86, organicMatterPct: 3.0, ph: 6.5, phosphorusPpm: 26, potassiumPpm: 168, appliedNitrogenRate: 145, yield: 213, savingsPerAcre: 24 },
  { state: "IA", county: "Polk", soilType: "clay_loam", acres: 96, organicMatterPct: 3.4, ph: 6.7, phosphorusPpm: 30, potassiumPpm: 186, appliedNitrogenRate: 143, yield: 215, savingsPerAcre: 26 },
  { state: "IA", county: "Polk", soilType: "clay_loam", acres: 108, organicMatterPct: 2.8, ph: 6.4, phosphorusPpm: 24, potassiumPpm: 158, appliedNitrogenRate: 147, yield: 211, savingsPerAcre: 22 },
  { state: "IA", county: "Polk", soilType: "clay_loam", acres: 124, organicMatterPct: 3.6, ph: 6.8, phosphorusPpm: 33, potassiumPpm: 196, appliedNitrogenRate: 142, yield: 216, savingsPerAcre: 27 },
  { state: "IL", county: "Champaign", soilType: "silt_loam", acres: 74, organicMatterPct: 2.6, ph: 6.2, phosphorusPpm: 16, potassiumPpm: 132, appliedNitrogenRate: 148, yield: 214, savingsPerAcre: 21 },
  { state: "IL", county: "Champaign", soilType: "silt_loam", acres: 82, organicMatterPct: 3.0, ph: 6.4, phosphorusPpm: 20, potassiumPpm: 150, appliedNitrogenRate: 145, yield: 217, savingsPerAcre: 23 },
  { state: "IL", county: "Champaign", soilType: "silt_loam", acres: 96, organicMatterPct: 3.5, ph: 6.7, phosphorusPpm: 25, potassiumPpm: 172, appliedNitrogenRate: 142, yield: 220, savingsPerAcre: 26 },
  { state: "IL", county: "Champaign", soilType: "silt_loam", acres: 108, organicMatterPct: 4.0, ph: 7.0, phosphorusPpm: 31, potassiumPpm: 198, appliedNitrogenRate: 139, yield: 223, savingsPerAcre: 28 },
  { state: "IL", county: "Champaign", soilType: "silt_loam", acres: 118, organicMatterPct: 2.8, ph: 6.3, phosphorusPpm: 18, potassiumPpm: 142, appliedNitrogenRate: 146, yield: 216, savingsPerAcre: 22 },
  { state: "IL", county: "Champaign", soilType: "silt_loam", acres: 126, organicMatterPct: 3.7, ph: 6.8, phosphorusPpm: 27, potassiumPpm: 184, appliedNitrogenRate: 141, yield: 221, savingsPerAcre: 27 },
  { state: "IN", county: "Tippecanoe", soilType: "silty_clay_loam", acres: 66, organicMatterPct: 1.9, ph: 6.0, phosphorusPpm: 12, potassiumPpm: 118, appliedNitrogenRate: 151, yield: 203, savingsPerAcre: 18 },
  { state: "IN", county: "Tippecanoe", soilType: "silty_clay_loam", acres: 78, organicMatterPct: 2.4, ph: 6.2, phosphorusPpm: 16, potassiumPpm: 136, appliedNitrogenRate: 147, yield: 207, savingsPerAcre: 20 },
  { state: "IN", county: "Tippecanoe", soilType: "silty_clay_loam", acres: 90, organicMatterPct: 2.9, ph: 6.5, phosphorusPpm: 21, potassiumPpm: 156, appliedNitrogenRate: 143, yield: 210, savingsPerAcre: 23 },
  { state: "IN", county: "Tippecanoe", soilType: "silty_clay_loam", acres: 102, organicMatterPct: 3.3, ph: 6.7, phosphorusPpm: 26, potassiumPpm: 176, appliedNitrogenRate: 140, yield: 213, savingsPerAcre: 25 },
  { state: "IN", county: "Tippecanoe", soilType: "silty_clay_loam", acres: 114, organicMatterPct: 2.1, ph: 6.1, phosphorusPpm: 14, potassiumPpm: 124, appliedNitrogenRate: 149, yield: 205, savingsPerAcre: 19 },
  { state: "IN", county: "Tippecanoe", soilType: "silty_clay_loam", acres: 122, organicMatterPct: 2.7, ph: 6.4, phosphorusPpm: 19, potassiumPpm: 148, appliedNitrogenRate: 145, yield: 209, savingsPerAcre: 22 }
];

export const canonicalFarms: CanonicalFarmFixture[] = [
  farm("mark_story_county", "Miller Farm", "Mark Miller", "MO", "Boone", [
    field({
      id: "mark_story_county_north_80",
      farmId: "mark_story_county",
      displayName: "Miller Farm / North 80",
      farmerName: "Mark Miller",
      farmName: "Miller Farm",
      fieldName: "North 80",
      state: "MO",
      county: "Boone",
      soilType: "silt_loam",
      acres: 80,
      previousCrop: "soybean",
      cornPricePerBushel: 4.65,
      nitrogenPricePerLb: 0.72,
      baselineNitrogenLbsPerAcre: 190,
      threeYearBaselineYield: 211,
      oemTarget: "john_deere",
      zones: [
        zone("Z1", 24, 3.1, 6.4, 42, 235, 0, 0, 24, 12),
        zone("Z2", 31, 4.8, 6.7, 36, 210, 24, 0, 52, 14),
        zone("Z3", 25, 2.2, 5.7, 28, 188, 0, 12, 52, 28)
      ],
      expected: {
        weightedNitrogenLbsPerAcreBand: [139, 142],
        dollarsSavedPerAcreBand: [34, 37],
        peerComparableCount: 5,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 204,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "mark_story_county_south_120",
      farmId: "mark_story_county",
      displayName: "Miller Farm / South 120",
      farmerName: "Mark Miller",
      farmName: "Miller Farm",
      fieldName: "South 120",
      state: "MO",
      county: "Boone",
      soilType: "silt_loam",
      acres: 120,
      previousCrop: "corn",
      cornPricePerBushel: 4.55,
      nitrogenPricePerLb: 0.74,
      baselineNitrogenLbsPerAcre: 205,
      threeYearBaselineYield: 218,
      oemTarget: "john_deere",
      zones: [
        zone("Z1", 30, 2.8, 6.3, 39, 224, 0, 0, 25, 15),
        zone("Z2", 34, 3.6, 6.8, 43, 242, 25, 0, 52, 16),
        zone("Z3", 28, 4.2, 6.5, 35, 210, 0, 15, 28, 32),
        zone("Z4", 28, 2.1, 5.6, 24, 172, 28, 16, 52, 32)
      ],
      expected: {
        weightedNitrogenLbsPerAcreBand: [182, 188],
        dollarsSavedPerAcreBand: [12, 18],
        peerComparableCount: 5,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 212,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("waverly_butler_county", "Waverly Ridge", "Nora Waverly", "MO", "Callaway", [
    field({
      id: "waverly_butler_county_east_64",
      farmId: "waverly_butler_county",
      displayName: "Waverly Ridge / East 64",
      farmerName: "Nora Waverly",
      farmName: "Waverly Ridge",
      fieldName: "East 64",
      state: "MO",
      county: "Callaway",
      soilType: "clay_loam",
      acres: 64,
      previousCrop: "soybean",
      cornPricePerBushel: 4.5,
      nitrogenPricePerLb: 0.76,
      baselineNitrogenLbsPerAcre: 184,
      threeYearBaselineYield: 203,
      oemTarget: "case_ih",
      zones: [zone("Z1", 21, 2.7, 6.2, 33, 204, 0, 0, 22, 14), zone("Z2", 22, 3.4, 6.6, 38, 220, 22, 0, 44, 14), zone("Z3", 21, 1.8, 5.5, 18, 150, 0, 14, 44, 28)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [141, 148],
        dollarsSavedPerAcreBand: [27, 34],
        peerComparableCount: 4,
        peerMediansVisible: false,
        guaranteeTriggerHarvestYield: 198,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "waverly_butler_county_prairie_96",
      farmId: "waverly_butler_county",
      displayName: "Waverly Ridge / Prairie 96",
      farmerName: "Nora Waverly",
      farmName: "Waverly Ridge",
      fieldName: "Prairie 96",
      state: "MO",
      county: "Callaway",
      soilType: "clay_loam",
      acres: 96,
      previousCrop: "corn",
      cornPricePerBushel: 4.5,
      nitrogenPricePerLb: 0.76,
      baselineNitrogenLbsPerAcre: 204,
      threeYearBaselineYield: 207,
      oemTarget: "case_ih",
      zones: [zone("Z1", 32, 2.4, 6.1, 30, 190, 0, 0, 30, 16), zone("Z2", 33, 3.8, 6.9, 42, 240, 30, 0, 58, 16), zone("Z3", 31, 2.0, 5.7, 22, 165, 0, 16, 58, 32)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [183, 190],
        dollarsSavedPerAcreBand: [10, 17],
        peerComparableCount: 4,
        peerMediansVisible: false,
        guaranteeTriggerHarvestYield: 201,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("caspian_boone_county", "Caspian Acres", "Evan Caspian", "MO", "Audrain", [
    field({
      id: "caspian_boone_county_home_80",
      farmId: "caspian_boone_county",
      displayName: "Caspian Acres / Home 80",
      farmerName: "Evan Caspian",
      farmName: "Caspian Acres",
      fieldName: "Home 80",
      state: "MO",
      county: "Audrain",
      soilType: "loam",
      acres: 80,
      previousCrop: "soybean",
      cornPricePerBushel: 4.4,
      nitrogenPricePerLb: 0.73,
      baselineNitrogenLbsPerAcre: 176,
      threeYearBaselineYield: 205,
      oemTarget: "agco",
      zones: [zone("Z1", 26, 3.0, 6.5, 36, 215, 0, 0, 24, 14), zone("Z2", 28, 4.2, 6.8, 39, 226, 24, 0, 50, 14), zone("Z3", 26, 2.2, 5.9, 25, 178, 0, 14, 50, 30)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [140, 143],
        dollarsSavedPerAcreBand: [23, 27],
        peerComparableCount: 3,
        peerMediansVisible: false,
        guaranteeTriggerHarvestYield: 200,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "caspian_boone_county_creek_112",
      farmId: "caspian_boone_county",
      displayName: "Caspian Acres / Creek 112",
      farmerName: "Evan Caspian",
      farmName: "Caspian Acres",
      fieldName: "Creek 112",
      state: "MO",
      county: "Audrain",
      soilType: "loam",
      acres: 112,
      previousCrop: "corn",
      cornPricePerBushel: 4.35,
      nitrogenPricePerLb: 0.73,
      baselineNitrogenLbsPerAcre: 194,
      threeYearBaselineYield: 209,
      oemTarget: "agco",
      zones: [zone("Z1", 37, 2.6, 6.3, 32, 204, 0, 0, 28, 15), zone("Z2", 38, 3.2, 6.6, 37, 216, 28, 0, 56, 15), zone("Z3", 37, 1.7, 5.4, 21, 152, 0, 15, 56, 32)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [186, 190],
        dollarsSavedPerAcreBand: [3, 6],
        peerComparableCount: 3,
        peerMediansVisible: false,
        guaranteeTriggerHarvestYield: 203,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("dorian_polk_county", "Dorian Family Farms", "Leah Dorian", "MO", "Cooper", [
    field({
      id: "dorian_polk_county_west_60",
      farmId: "dorian_polk_county",
      displayName: "Dorian Family Farms / West 60",
      farmerName: "Leah Dorian",
      farmName: "Dorian Family Farms",
      fieldName: "West 60",
      state: "MO",
      county: "Cooper",
      soilType: "sandy_loam",
      acres: 60,
      previousCrop: "soybean",
      cornPricePerBushel: 4.55,
      nitrogenPricePerLb: 0.77,
      baselineNitrogenLbsPerAcre: 168,
      threeYearBaselineYield: 194,
      oemTarget: "john_deere",
      zones: [zone("Z1", 20, 1.6, 5.5, 16, 132, 0, 0, 20, 12), zone("Z2", 20, 2.4, 6.1, 24, 160, 20, 0, 40, 12), zone("Z3", 20, 3.0, 6.5, 30, 186, 0, 12, 40, 25)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [145, 151],
        dollarsSavedPerAcreBand: [13, 20],
        peerComparableCount: 2,
        peerMediansVisible: false,
        guaranteeTriggerHarvestYield: 189,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "dorian_polk_county_south_pivot_140",
      farmId: "dorian_polk_county",
      displayName: "Dorian Family Farms / South Pivot 140",
      farmerName: "Leah Dorian",
      farmName: "Dorian Family Farms",
      fieldName: "South Pivot 140",
      state: "MO",
      county: "Cooper",
      soilType: "sandy_loam",
      acres: 140,
      previousCrop: "corn",
      cornPricePerBushel: 4.55,
      nitrogenPricePerLb: 0.77,
      baselineNitrogenLbsPerAcre: 196,
      threeYearBaselineYield: 199,
      oemTarget: "john_deere",
      zones: [zone("Z1", 45, 1.9, 5.7, 18, 140, 0, 0, 32, 18), zone("Z2", 48, 2.8, 6.2, 29, 180, 32, 0, 64, 18), zone("Z3", 47, 3.3, 6.6, 34, 202, 0, 18, 64, 36)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [186, 193],
        dollarsSavedPerAcreBand: [2, 8],
        peerComparableCount: 0,
        peerMediansVisible: false,
        guaranteeTriggerHarvestYield: 194,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("beckett_dallas_county", "Beckett Bros.", "Owen Beckett", "MO", "Lafayette", [
    field({
      id: "beckett_dallas_county_hill_72",
      farmId: "beckett_dallas_county",
      displayName: "Beckett Bros. / Hill 72",
      farmerName: "Owen Beckett",
      farmName: "Beckett Bros.",
      fieldName: "Hill 72",
      state: "MO",
      county: "Lafayette",
      soilType: "silty_clay_loam",
      acres: 72,
      previousCrop: "soybean",
      cornPricePerBushel: 4.6,
      nitrogenPricePerLb: 0.75,
      baselineNitrogenLbsPerAcre: 188,
      threeYearBaselineYield: 208,
      oemTarget: "case_ih",
      zones: [zone("Z1", 24, 2.9, 6.4, 34, 210, 0, 0, 22, 14), zone("Z2", 25, 4.1, 6.9, 41, 236, 22, 0, 45, 14), zone("Z3", 23, 2.0, 5.6, 23, 166, 0, 14, 45, 30)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [139, 146],
        dollarsSavedPerAcreBand: [30, 38],
        peerComparableCount: 0,
        peerMediansVisible: false,
        guaranteeTriggerHarvestYield: 202,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "beckett_dallas_county_bottom_108",
      farmId: "beckett_dallas_county",
      displayName: "Beckett Bros. / Bottom 108",
      farmerName: "Owen Beckett",
      farmName: "Beckett Bros.",
      fieldName: "Bottom 108",
      state: "MO",
      county: "Lafayette",
      soilType: "silty_clay_loam",
      acres: 108,
      previousCrop: "corn",
      cornPricePerBushel: 4.6,
      nitrogenPricePerLb: 0.75,
      baselineNitrogenLbsPerAcre: 206,
      threeYearBaselineYield: 216,
      oemTarget: "case_ih",
      zones: [zone("Z1", 35, 2.5, 6.1, 30, 188, 0, 0, 28, 16), zone("Z2", 38, 3.5, 6.7, 38, 224, 28, 0, 58, 16), zone("Z3", 35, 4.4, 7.1, 44, 250, 0, 16, 58, 34)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [181, 190],
        dollarsSavedPerAcreBand: [12, 20],
        peerComparableCount: 0,
        peerMediansVisible: false,
        guaranteeTriggerHarvestYield: 210,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("harlan_story_county", "Harlan Heritage", "Maya Harlan", "IA", "Story", [
    field({
      id: "harlan_story_county_west_88",
      farmId: "harlan_story_county",
      displayName: "Harlan Heritage / West 88",
      farmerName: "Maya Harlan",
      farmName: "Harlan Heritage",
      fieldName: "West 88",
      state: "IA",
      county: "Story",
      soilType: "silt_loam",
      acres: 88,
      previousCrop: "soybean",
      cornPricePerBushel: 4.58,
      nitrogenPricePerLb: 0.71,
      baselineNitrogenLbsPerAcre: 186,
      threeYearBaselineYield: 216,
      oemTarget: "john_deere",
      zones: [zone("Z1", 28, 3.3, 6.5, 40, 230, 0, 0, 26, 14), zone("Z2", 30, 4.6, 6.8, 44, 248, 26, 0, 54, 15), zone("Z3", 30, 2.4, 5.8, 27, 184, 0, 14, 54, 31)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [140, 144],
        dollarsSavedPerAcreBand: [30, 33],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 210,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "harlan_story_county_north_132",
      farmId: "harlan_story_county",
      displayName: "Harlan Heritage / North 132",
      farmerName: "Maya Harlan",
      farmName: "Harlan Heritage",
      fieldName: "North 132",
      state: "IA",
      county: "Story",
      soilType: "silt_loam",
      acres: 132,
      previousCrop: "corn",
      cornPricePerBushel: 4.52,
      nitrogenPricePerLb: 0.72,
      baselineNitrogenLbsPerAcre: 206,
      threeYearBaselineYield: 222,
      oemTarget: "john_deere",
      zones: [zone("Z1", 42, 2.7, 6.2, 34, 205, 0, 0, 34, 16), zone("Z2", 46, 3.9, 6.7, 42, 236, 34, 0, 68, 17), zone("Z3", 44, 2.1, 5.6, 23, 165, 0, 16, 68, 34)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [184, 189],
        dollarsSavedPerAcreBand: [12, 16],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 216,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("richter_mclean_county", "Richter Prairie", "Caleb Richter", "IL", "McLean", [
    field({
      id: "richter_mclean_county_east_76",
      farmId: "richter_mclean_county",
      displayName: "Richter Prairie / East 76",
      farmerName: "Caleb Richter",
      farmName: "Richter Prairie",
      fieldName: "East 76",
      state: "IL",
      county: "McLean",
      soilType: "silty_clay_loam",
      acres: 76,
      previousCrop: "soybean",
      cornPricePerBushel: 4.62,
      nitrogenPricePerLb: 0.73,
      baselineNitrogenLbsPerAcre: 182,
      threeYearBaselineYield: 218,
      oemTarget: "case_ih",
      zones: [zone("Z1", 24, 3.8, 6.6, 44, 242, 0, 0, 24, 14), zone("Z2", 27, 4.9, 7.0, 50, 260, 24, 0, 50, 15), zone("Z3", 25, 2.6, 5.9, 28, 182, 0, 14, 50, 30)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [135, 139],
        dollarsSavedPerAcreBand: [31, 35],
        peerComparableCount: 5,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 212,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "richter_mclean_county_south_118",
      farmId: "richter_mclean_county",
      displayName: "Richter Prairie / South 118",
      farmerName: "Caleb Richter",
      farmName: "Richter Prairie",
      fieldName: "South 118",
      state: "IL",
      county: "McLean",
      soilType: "silty_clay_loam",
      acres: 118,
      previousCrop: "corn",
      cornPricePerBushel: 4.58,
      nitrogenPricePerLb: 0.73,
      baselineNitrogenLbsPerAcre: 202,
      threeYearBaselineYield: 224,
      oemTarget: "case_ih",
      zones: [zone("Z1", 38, 3.1, 6.3, 36, 210, 0, 0, 32, 16), zone("Z2", 40, 4.3, 6.8, 45, 250, 32, 0, 64, 17), zone("Z3", 40, 2.2, 5.7, 24, 170, 0, 16, 64, 34)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [180, 185],
        dollarsSavedPerAcreBand: [12, 17],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 218,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("porter_benton_county", "Porter Line Farms", "Elise Porter", "IN", "Benton", [
    field({
      id: "porter_benton_county_grid_70",
      farmId: "porter_benton_county",
      displayName: "Porter Line Farms / Grid 70",
      farmerName: "Elise Porter",
      farmName: "Porter Line Farms",
      fieldName: "Grid 70",
      state: "IN",
      county: "Benton",
      soilType: "loam",
      acres: 70,
      previousCrop: "soybean",
      cornPricePerBushel: 4.55,
      nitrogenPricePerLb: 0.74,
      baselineNitrogenLbsPerAcre: 178,
      threeYearBaselineYield: 207,
      oemTarget: "agco",
      zones: [zone("Z1", 22, 2.9, 6.2, 32, 198, 0, 0, 22, 13), zone("Z2", 24, 3.7, 6.6, 37, 216, 22, 0, 46, 14), zone("Z3", 24, 2.0, 5.6, 20, 158, 0, 13, 46, 28)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [138, 142],
        dollarsSavedPerAcreBand: [26, 31],
        peerComparableCount: 5,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 201,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "porter_benton_county_home_104",
      farmId: "porter_benton_county",
      displayName: "Porter Line Farms / Home 104",
      farmerName: "Elise Porter",
      farmName: "Porter Line Farms",
      fieldName: "Home 104",
      state: "IN",
      county: "Benton",
      soilType: "loam",
      acres: 104,
      previousCrop: "corn",
      cornPricePerBushel: 4.5,
      nitrogenPricePerLb: 0.74,
      baselineNitrogenLbsPerAcre: 198,
      threeYearBaselineYield: 212,
      oemTarget: "agco",
      zones: [zone("Z1", 34, 2.5, 6.1, 30, 188, 0, 0, 30, 15), zone("Z2", 35, 3.4, 6.5, 38, 220, 30, 0, 58, 16), zone("Z3", 35, 1.8, 5.5, 21, 150, 0, 15, 58, 32)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [178, 183],
        dollarsSavedPerAcreBand: [10, 15],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 206,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("keller_polk_county", "Keller Creek", "Jonah Keller", "IA", "Polk", [
    field({
      id: "keller_polk_county_ridge_92",
      farmId: "keller_polk_county",
      displayName: "Keller Creek / Ridge 92",
      farmerName: "Jonah Keller",
      farmName: "Keller Creek",
      fieldName: "Ridge 92",
      state: "IA",
      county: "Polk",
      soilType: "clay_loam",
      acres: 92,
      previousCrop: "soybean",
      cornPricePerBushel: 4.56,
      nitrogenPricePerLb: 0.72,
      baselineNitrogenLbsPerAcre: 184,
      threeYearBaselineYield: 211,
      oemTarget: "john_deere",
      zones: [zone("Z1", 30, 2.6, 6.1, 30, 198, 0, 0, 28, 14), zone("Z2", 32, 3.5, 6.5, 38, 220, 28, 0, 58, 15), zone("Z3", 30, 1.9, 5.5, 22, 160, 0, 15, 58, 31)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [140, 147],
        dollarsSavedPerAcreBand: [27, 33],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 205,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "keller_polk_county_east_126",
      farmId: "keller_polk_county",
      displayName: "Keller Creek / East 126",
      farmerName: "Jonah Keller",
      farmName: "Keller Creek",
      fieldName: "East 126",
      state: "IA",
      county: "Polk",
      soilType: "clay_loam",
      acres: 126,
      previousCrop: "corn",
      cornPricePerBushel: 4.5,
      nitrogenPricePerLb: 0.72,
      baselineNitrogenLbsPerAcre: 204,
      threeYearBaselineYield: 216,
      oemTarget: "john_deere",
      zones: [zone("Z1", 40, 2.4, 6.0, 28, 184, 0, 0, 35, 16), zone("Z2", 43, 3.2, 6.5, 36, 218, 35, 0, 70, 17), zone("Z3", 43, 2.0, 5.6, 23, 162, 0, 16, 70, 34)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [181, 190],
        dollarsSavedPerAcreBand: [10, 17],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 210,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("nolan_champaign_county", "Nolan Flats", "Brielle Nolan", "IL", "Champaign", [
    field({
      id: "nolan_champaign_county_west_84",
      farmId: "nolan_champaign_county",
      displayName: "Nolan Flats / West 84",
      farmerName: "Brielle Nolan",
      farmName: "Nolan Flats",
      fieldName: "West 84",
      state: "IL",
      county: "Champaign",
      soilType: "silt_loam",
      acres: 84,
      previousCrop: "soybean",
      cornPricePerBushel: 4.6,
      nitrogenPricePerLb: 0.73,
      baselineNitrogenLbsPerAcre: 188,
      threeYearBaselineYield: 220,
      oemTarget: "case_ih",
      zones: [zone("Z1", 27, 3.6, 6.6, 42, 232, 0, 0, 26, 14), zone("Z2", 29, 4.7, 6.9, 48, 256, 26, 0, 54, 15), zone("Z3", 28, 2.5, 5.9, 26, 176, 0, 14, 54, 30)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [134, 141],
        dollarsSavedPerAcreBand: [32, 39],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 214,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "nolan_champaign_county_south_140",
      farmId: "nolan_champaign_county",
      displayName: "Nolan Flats / South 140",
      farmerName: "Brielle Nolan",
      farmName: "Nolan Flats",
      fieldName: "South 140",
      state: "IL",
      county: "Champaign",
      soilType: "silt_loam",
      acres: 140,
      previousCrop: "corn",
      cornPricePerBushel: 4.55,
      nitrogenPricePerLb: 0.73,
      baselineNitrogenLbsPerAcre: 208,
      threeYearBaselineYield: 226,
      oemTarget: "case_ih",
      zones: [zone("Z1", 45, 2.9, 6.2, 34, 204, 0, 0, 38, 16), zone("Z2", 48, 4.1, 6.7, 43, 238, 38, 0, 76, 17), zone("Z3", 47, 2.1, 5.7, 22, 164, 0, 16, 76, 34)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [183, 191],
        dollarsSavedPerAcreBand: [10, 19],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 220,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ]),
  farm("rusk_tippecanoe_county", "Rusk Prairie", "Marta Rusk", "IN", "Tippecanoe", [
    field({
      id: "rusk_tippecanoe_county_home_82",
      farmId: "rusk_tippecanoe_county",
      displayName: "Rusk Prairie / Home 82",
      farmerName: "Marta Rusk",
      farmName: "Rusk Prairie",
      fieldName: "Home 82",
      state: "IN",
      county: "Tippecanoe",
      soilType: "silty_clay_loam",
      acres: 82,
      previousCrop: "soybean",
      cornPricePerBushel: 4.52,
      nitrogenPricePerLb: 0.74,
      baselineNitrogenLbsPerAcre: 180,
      threeYearBaselineYield: 210,
      oemTarget: "agco",
      zones: [zone("Z1", 26, 2.8, 6.2, 32, 198, 0, 0, 26, 14), zone("Z2", 28, 3.6, 6.6, 38, 220, 26, 0, 54, 15), zone("Z3", 28, 2.0, 5.6, 20, 154, 0, 14, 54, 30)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [136, 144],
        dollarsSavedPerAcreBand: [25, 32],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 204,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    }),
    field({
      id: "rusk_tippecanoe_county_north_128",
      farmId: "rusk_tippecanoe_county",
      displayName: "Rusk Prairie / North 128",
      farmerName: "Marta Rusk",
      farmName: "Rusk Prairie",
      fieldName: "North 128",
      state: "IN",
      county: "Tippecanoe",
      soilType: "silty_clay_loam",
      acres: 128,
      previousCrop: "corn",
      cornPricePerBushel: 4.48,
      nitrogenPricePerLb: 0.74,
      baselineNitrogenLbsPerAcre: 200,
      threeYearBaselineYield: 215,
      oemTarget: "agco",
      zones: [zone("Z1", 41, 2.4, 6.0, 28, 182, 0, 0, 34, 16), zone("Z2", 44, 3.2, 6.4, 36, 216, 34, 0, 70, 17), zone("Z3", 43, 1.8, 5.5, 21, 150, 0, 16, 70, 34)],
      expected: {
        weightedNitrogenLbsPerAcreBand: [180, 188],
        dollarsSavedPerAcreBand: [8, 16],
        peerComparableCount: 6,
        peerMediansVisible: true,
        guaranteeTriggerHarvestYield: 209,
        vrtDbfFields: ["N_RATE_LBS"]
      }
    })
  ])
];

export function canonicalFieldFixtures() {
  return canonicalFarms.flatMap((farmFixture) => farmFixture.fields);
}

export function defaultFieldFixture() {
  return canonicalFarms[0].fields[0];
}

export function getCanonicalFieldFixture(id: string) {
  return canonicalFieldFixtures().find((fieldFixture) => fieldFixture.id === id) ?? null;
}

type FieldInput = {
  id: string;
  farmId: string;
  displayName: string;
  farmerName: string;
  farmName: string;
  fieldName: string;
  state: StateCode;
  county: string;
  soilType: string;
  acres: number;
  previousCrop: PreviousCrop;
  cornPricePerBushel: number;
  nitrogenPricePerLb: number;
  baselineNitrogenLbsPerAcre: number;
  threeYearBaselineYield: number;
  oemTarget: OemTarget;
  zones: SoilZone[];
  expected: CanonicalFieldFixture["expected"];
};

function farm(id: string, displayName: string, ownerName: string, state: StateCode, county: string, fields: CanonicalFieldFixture[]): CanonicalFarmFixture {
  return { id, displayName, ownerName, state, county, synthetic: true, fields };
}

function field(input: FieldInput): CanonicalFieldFixture {
  return {
    id: input.id,
    farmId: input.farmId,
    displayName: input.displayName,
    synthetic: true,
    oemTarget: input.oemTarget,
    profile: {
      farmName: input.farmName,
      farmerName: input.farmerName,
      agronomistName: "Raimond + Jensen Agronomy",
      fieldName: input.fieldName,
      state: input.state,
      county: input.county,
      soilType: input.soilType,
      crop: "corn",
      seasonYear: 2026,
      acres: input.acres,
      previousCrop: input.previousCrop,
      cornPricePerBushel: input.cornPricePerBushel,
      nitrogenPricePerLb: input.nitrogenPricePerLb,
      baselineNitrogenLbsPerAcre: input.baselineNitrogenLbsPerAcre,
      threeYearBaselineYield: input.threeYearBaselineYield
    },
    zones: input.zones,
    soilTest: {
      sampledAt: "2026-03-15",
      labName: "Synthetic Midwest Agronomy Lab"
    },
    yieldRecords: [
      { seasonYear: 2023, yieldBuPerAcre: input.threeYearBaselineYield - 4, source: "combine_monitor" },
      { seasonYear: 2024, yieldBuPerAcre: input.threeYearBaselineYield + 2, source: "combine_monitor" },
      { seasonYear: 2025, yieldBuPerAcre: input.threeYearBaselineYield + 1, source: "operator_entry" }
    ],
    expected: input.expected
  };
}

function zone(zoneId: string, acres: number, organicMatterPct: number, ph: number, phosphorusPpm: number, potassiumPpm: number, x1: number, y1: number, x2: number, y2: number): SoilZone {
  return {
    zoneId,
    acres,
    organicMatterPct,
    ph,
    phosphorusPpm,
    potassiumPpm,
    polygonWkt: `POLYGON((${x1} ${y1}, ${x2} ${y1}, ${x2} ${y2}, ${x1} ${y2}, ${x1} ${y1}))`
  };
}
