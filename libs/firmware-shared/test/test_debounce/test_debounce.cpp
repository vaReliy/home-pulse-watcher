#include <unity.h>
#include "HomePulse/debounce.h"

using namespace HomePulse;

static DebounceState makeState(int committed) {
  return {committed, kDebounceIdle, 0};
}

void test_no_transition_when_stable(void) {
  DebounceState s = makeState(1);
  DebounceDecision d = debounceTick(s, 1, 2);
  TEST_ASSERT_FALSE(d.transition);
  TEST_ASSERT_EQUAL(1, d.newCommitted);
}

void test_no_transition_before_required_consecutive(void) {
  DebounceState s = makeState(1);
  DebounceDecision d = debounceTick(s, 0, 3);
  TEST_ASSERT_FALSE(d.transition);
  TEST_ASSERT_EQUAL(0, s.pending);
  TEST_ASSERT_EQUAL(1, s.consecutive);
}

void test_transition_after_required_consecutive(void) {
  DebounceState s = makeState(1);
  debounceTick(s, 0, 2);
  DebounceDecision d = debounceTick(s, 0, 2);
  TEST_ASSERT_TRUE(d.transition);
  TEST_ASSERT_EQUAL(0, d.newCommitted);
  TEST_ASSERT_EQUAL(kDebounceIdle, s.pending);
  TEST_ASSERT_EQUAL(0, s.consecutive);
}

void test_flap_resets_consecutive_count(void) {
  DebounceState s = makeState(1);
  debounceTick(s, 0, 3);  // tick 1: pending=0, consecutive=1
  debounceTick(s, 1, 3);  // flap back → cleared (reading == committed, so pending resets)
  TEST_ASSERT_EQUAL(kDebounceIdle, s.pending);
  TEST_ASSERT_EQUAL(0, s.consecutive);
  DebounceDecision d = debounceTick(s, 0, 3);  // new candidate
  TEST_ASSERT_FALSE(d.transition);
  TEST_ASSERT_EQUAL(1, s.consecutive);
}

void test_n1_required_transitions_immediately(void) {
  DebounceState s = makeState(1);
  DebounceDecision d = debounceTick(s, 0, 1);
  TEST_ASSERT_TRUE(d.transition);
  TEST_ASSERT_EQUAL(0, d.newCommitted);
}

void test_committed_unchanged_on_no_transition(void) {
  DebounceState s = makeState(1);
  debounceTick(s, 0, 3);
  debounceTick(s, 0, 3);
  TEST_ASSERT_EQUAL(1, s.committed);  // still not confirmed
}

void test_different_pending_resets_counter(void) {
  // First candidate: 0 (1 tick)
  // New candidate: 0 again → counter keeps counting
  // Then candidate changes to -1 → counter resets to 1
  DebounceState s = makeState(1);
  debounceTick(s, 0, 5);   // pending=0, consecutive=1
  debounceTick(s, 0, 5);   // pending=0, consecutive=2
  debounceTick(s, -1, 5);  // different candidate → pending=-1, consecutive=1
  TEST_ASSERT_EQUAL(-1, s.pending);
  TEST_ASSERT_EQUAL(1, s.consecutive);
}

void test_state_after_confirmed_transition_is_clean(void) {
  DebounceState s = makeState(1);
  debounceTick(s, 0, 2);
  DebounceDecision d = debounceTick(s, 0, 2);
  TEST_ASSERT_TRUE(d.transition);
  TEST_ASSERT_EQUAL(0, s.committed);
  TEST_ASSERT_EQUAL(kDebounceIdle, s.pending);
  TEST_ASSERT_EQUAL(0, s.consecutive);
}

void setUp(void) {}
void tearDown(void) {}

int main(void) {
  UNITY_BEGIN();
  RUN_TEST(test_no_transition_when_stable);
  RUN_TEST(test_no_transition_before_required_consecutive);
  RUN_TEST(test_transition_after_required_consecutive);
  RUN_TEST(test_flap_resets_consecutive_count);
  RUN_TEST(test_n1_required_transitions_immediately);
  RUN_TEST(test_committed_unchanged_on_no_transition);
  RUN_TEST(test_different_pending_resets_counter);
  RUN_TEST(test_state_after_confirmed_transition_is_clean);
  return UNITY_END();
}
