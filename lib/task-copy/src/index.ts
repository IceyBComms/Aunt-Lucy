/**
 * @workspace/task-copy — the product's one voice for a task.
 *
 * Plain TypeScript, no dependencies, imported by BOTH api-server and rally so
 * that a task is named, dated and timed the same way in an email, a text, a
 * calendar entry and on every screen. See the file comments for the rulings
 * behind each part (rows #136, #139, #143 — Kate, 21 September 2026).
 */
export {
  SLOT_TYPES,
  TASK_COPY,
  taskLabel,
  taskNoun,
  taskShortNoun,
  taskInstruction,
  type SlotType,
  type TaskCopy,
} from "./taskNames";

export {
  ANY_TIME_THAT_DAY,
  ANY_TIME_THAT_DAY_CLAUSE,
  WHENEVER_SUITS,
  WHENEVER_SUITS_CLAUSE,
  CARD_JOIN,
  formatTaskDate,
  formatTaskTime,
  taskWhenCard,
  taskWhenSentence,
  taskWhenClause,
  formatShortDate,
} from "./when";

export {
  defaultFlexibility,
  defaultFlexibilityForType,
  type SlotFlexibility,
} from "./flexibility";
