#include "HomePulse/debounce.h"

namespace HomePulse {

DebounceDecision debounceTick(DebounceState& state, int reading, uint8_t requiredConsecutive) {
  if (reading != state.committed) {
    if (reading == state.pending) {
      state.consecutive++;
    } else {
      state.pending = reading;
      state.consecutive = 1;
    }
    if (state.consecutive >= requiredConsecutive) {
      state.committed = state.pending;
      state.pending = kDebounceIdle;
      state.consecutive = 0;
      return {true, state.committed};
    }
  } else {
    if (state.pending != kDebounceIdle) {
      state.pending = kDebounceIdle;
      state.consecutive = 0;
    }
  }
  return {false, state.committed};
}

}  // namespace HomePulse
