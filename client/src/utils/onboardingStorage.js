const ONBOARDING_DISABLED_TEMPORARILY = false;
const LOCAL_ONBOARDING_KEY_PREFIX = 'fluency_onboarding_done:';

function localOnboardingKey(email) {
    return `${LOCAL_ONBOARDING_KEY_PREFIX}${email}`;
}

export function markOnboardingDone(email) {
    if (!email) return;
    localStorage.setItem(localOnboardingKey(email), '1');
}

export function isOnboardingDoneLocally(email) {
    if (!email) return false;
    return localStorage.getItem(localOnboardingKey(email)) === '1';
}

export function resolveOnboardingCompleted(user, serverCompleted) {
    if (!user?.email) return false;
    if (isOnboardingDoneLocally(user.email)) return true;
    if (user.onboarding_completed === true) return true;
    return serverCompleted === true;
}

export function shouldShowOnboarding(user) {
    if (ONBOARDING_DISABLED_TEMPORARILY) return false;
    if (!user?.email) return false;
    return !resolveOnboardingCompleted(user, user.onboarding_completed);
}
