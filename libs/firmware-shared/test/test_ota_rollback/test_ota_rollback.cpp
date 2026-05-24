#include <unity.h>
#include "HomePulse/ota.h"

using namespace HomePulse::Ota;

// ─── shouldMarkAppValid ───────────────────────────────────────────────────────

void test_not_pending_always_false(void) {
    // pendingValidation=false → never mark valid regardless of counters
    TEST_ASSERT_FALSE(shouldMarkAppValid(false, 10, 600000, 3, 300000));
}

void test_below_min_heartbeats_false(void) {
    // 2 heartbeats when 3 required → false even if uptime is met
    TEST_ASSERT_FALSE(shouldMarkAppValid(true, 2, 600000, 3, 300000));
}

void test_below_min_uptime_false(void) {
    // uptime 4 min 59 s when 5 min required → false even if heartbeats met
    TEST_ASSERT_FALSE(shouldMarkAppValid(true, 3, 299999, 3, 300000));
}

void test_all_conditions_met_true(void) {
    // exactly at boundary: 3 heartbeats, 5 min uptime → true
    TEST_ASSERT_TRUE(shouldMarkAppValid(true, 3, 300000, 3, 300000));
}

void test_above_minimum_true(void) {
    // well above both thresholds → true
    TEST_ASSERT_TRUE(shouldMarkAppValid(true, 10, 3600000, 3, 300000));
}

void test_zero_heartbeats_false(void) {
    TEST_ASSERT_FALSE(shouldMarkAppValid(true, 0, 600000, 3, 300000));
}

void test_zero_uptime_false(void) {
    TEST_ASSERT_FALSE(shouldMarkAppValid(true, 5, 0, 3, 300000));
}

void test_boundary_one_below_heartbeats_false(void) {
    // minHeartbeats=1, heartbeats=0 → false
    TEST_ASSERT_FALSE(shouldMarkAppValid(true, 0, 300000, 1, 300000));
}

void test_boundary_one_at_heartbeats_true(void) {
    // minHeartbeats=1, heartbeats=1, uptime met → true
    TEST_ASSERT_TRUE(shouldMarkAppValid(true, 1, 300000, 1, 300000));
}

// ─── Unity wiring ─────────────────────────────────────────────────────────────

void setUp(void) {}
void tearDown(void) {}

int main(void) {
    UNITY_BEGIN();

    RUN_TEST(test_not_pending_always_false);
    RUN_TEST(test_below_min_heartbeats_false);
    RUN_TEST(test_below_min_uptime_false);
    RUN_TEST(test_all_conditions_met_true);
    RUN_TEST(test_above_minimum_true);
    RUN_TEST(test_zero_heartbeats_false);
    RUN_TEST(test_zero_uptime_false);
    RUN_TEST(test_boundary_one_below_heartbeats_false);
    RUN_TEST(test_boundary_one_at_heartbeats_true);

    return UNITY_END();
}
