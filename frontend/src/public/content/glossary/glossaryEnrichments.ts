import type { Lang } from "../../../i18n";
import type { GlossaryTermEnhancement } from "./glossaryData";

import { bankrollEnhancement } from "./enrichments/bankroll/bankroll";
import { kellyCriterionEnhancement } from "./enrichments/bankroll/kellyCriterion";
import { stakeEnhancement } from "./enrichments/bankroll/stake";
import { unitEnhancement } from "./enrichments/bankroll/unit";

import { asianHandicapEnhancement } from "./enrichments/markets/asianHandicap";
import { asianTotalEnhancement } from "./enrichments/markets/asianTotal";
import { bttsEnhancement } from "./enrichments/markets/btts";
import { cleanSheetEnhancement } from "./enrichments/markets/cleanSheet";
import { correctScoreEnhancement } from "./enrichments/markets/correctScore";
import { doubleChanceEnhancement } from "./enrichments/markets/doubleChance";
import { drawNoBetEnhancement } from "./enrichments/markets/drawNoBet";
import { halfLossEnhancement } from "./enrichments/markets/halfLoss";
import { halfWinEnhancement } from "./enrichments/markets/halfWin";
import { moneylineEnhancement } from "./enrichments/markets/moneyline";
import { overUnderEnhancement } from "./enrichments/markets/overUnder";
import { parlayEnhancement } from "./enrichments/markets/parlay";
import { propBetEnhancement } from "./enrichments/markets/propBet";
import { pushEnhancement } from "./enrichments/markets/push";
import { sameGameParlayEnhancement } from "./enrichments/markets/sameGameParlay";
import { teamTotalEnhancement } from "./enrichments/markets/teamTotal";

import { americanOddsEnhancement } from "./enrichments/odds/americanOdds";
import { decimalOddsEnhancement } from "./enrichments/odds/decimalOdds";
import { fairOddsEnhancement } from "./enrichments/odds/fairOdds";
import { fractionalOddsEnhancement } from "./enrichments/odds/fractionalOdds";
import { lineMovementEnhancement } from "./enrichments/odds/lineMovement";
import { lineShoppingEnhancement } from "./enrichments/odds/lineShopping";
import { overroundEnhancement } from "./enrichments/odds/overround";
import { steamMoveEnhancement } from "./enrichments/odds/steamMove";

import { edgeEnhancement } from "./enrichments/probability/edge";
import { impliedProbabilityEnhancement } from "./enrichments/probability/impliedProbability";
import { modelProbabilityEnhancement } from "./enrichments/probability/modelProbability";
import { noVigProbabilityEnhancement } from "./enrichments/probability/noVigProbability";
import { trueProbabilityEnhancement } from "./enrichments/probability/trueProbability";

import { closingLineValueEnhancement } from "./enrichments/strategy/closingLineValue";
import { expectedValueEnhancement } from "./enrichments/strategy/expectedValue";
import { hitRateEnhancement } from "./enrichments/strategy/hitRate";
import { roiEnhancement } from "./enrichments/strategy/roi";
import { sampleSizeEnhancement } from "./enrichments/strategy/sampleSize";
import { valueBetEnhancement } from "./enrichments/strategy/valueBet";
import { varianceEnhancement } from "./enrichments/strategy/variance";

export type GlossaryTermEnhancementByLang = Partial<
  Record<Lang, GlossaryTermEnhancement>
>;

export const GLOSSARY_TERM_ENRICHMENTS: Record<
  string,
  GlossaryTermEnhancementByLang
> = {
  "american-odds": americanOddsEnhancement,
  "asian-handicap": asianHandicapEnhancement,
  "asian-total": asianTotalEnhancement,
  bankroll: bankrollEnhancement,
  btts: bttsEnhancement,
  "clean-sheet": cleanSheetEnhancement,
  "closing-line-value": closingLineValueEnhancement,
  "correct-score": correctScoreEnhancement,
  "decimal-odds": decimalOddsEnhancement,
  "double-chance": doubleChanceEnhancement,
  "draw-no-bet": drawNoBetEnhancement,
  edge: edgeEnhancement,
  "expected-value": expectedValueEnhancement,
  "fair-odds": fairOddsEnhancement,
  "fractional-odds": fractionalOddsEnhancement,
  "half-loss": halfLossEnhancement,
  "half-win": halfWinEnhancement,
  "hit-rate": hitRateEnhancement,
  "implied-probability": impliedProbabilityEnhancement,
  "kelly-criterion": kellyCriterionEnhancement,
  "line-movement": lineMovementEnhancement,
  "line-shopping": lineShoppingEnhancement,
  "model-probability": modelProbabilityEnhancement,
  moneyline: moneylineEnhancement,
  "no-vig-probability": noVigProbabilityEnhancement,
  overround: overroundEnhancement,
  "over-under": overUnderEnhancement,
  parlay: parlayEnhancement,
  "prop-bet": propBetEnhancement,
  push: pushEnhancement,
  roi: roiEnhancement,
  "same-game-parlay": sameGameParlayEnhancement,
  "sample-size": sampleSizeEnhancement,
  stake: stakeEnhancement,
  "steam-move": steamMoveEnhancement,
  "team-total": teamTotalEnhancement,
  "true-probability": trueProbabilityEnhancement,
  unit: unitEnhancement,
  "value-bet": valueBetEnhancement,
  variance: varianceEnhancement,
};
