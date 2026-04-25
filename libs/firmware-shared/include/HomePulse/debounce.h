#pragma once
#include <stdint.h>

namespace HomePulse {

/** Sentinel: no pending transition in progress. Must match kPowerStatusUnknown (-1). */
static constexpr int kDebounceIdle = -1;

struct DebounceState {
  int committed;       ///< Last confirmed/reported status
  int pending;         ///< Candidate status being confirmed (kDebounceIdle = none)
  uint8_t consecutive; ///< How many ticks pending has held stable
};

struct DebounceDecision {
  bool transition;   ///< true if committed just changed this tick
  int newCommitted;  ///< value of committed after this tick
};

/**
 * Advance the debounce state machine by one tick.
 *
 * @param state               Mutable state owned by the caller (persists across ticks)
 * @param reading             Current raw status reading
 * @param requiredConsecutive How many stable ticks confirm a transition
 * @return                    Decision: whether a confirmed transition occurred
 */
DebounceDecision debounceTick(DebounceState& state, int reading, uint8_t requiredConsecutive);

}  // namespace HomePulse
