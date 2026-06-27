const ONBOARDING_DISABLED_TEMPORARILY = false;

export function shouldShowOnboarding(user) {
    if (ONBOARDING_DISABLED_TEMPORARILY) return false;
    if (!user?.email) return false;
    return user.onboarding_completed !== true;
}
