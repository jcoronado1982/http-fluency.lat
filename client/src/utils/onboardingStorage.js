export function shouldShowOnboarding(user) {
    if (!user?.email) return false;
    return user.onboarding_completed !== true;
}
