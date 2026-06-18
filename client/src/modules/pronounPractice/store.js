import { create } from 'zustand';

export const usePronounPracticeStore = create((set) => ({
  score: 0,
  combo: 0,
  currentStep: 1,

  addPerfectScore: () =>
    set((state) => ({
      score: state.score + 500,
      combo: state.combo + 1,
      currentStep: state.currentStep + 1,
    })),

  useHintPenalty: () =>
    set((state) => ({
      score: Math.max(0, state.score - 100),
      combo: 0,
    })),

  failPenalty: () =>
    set((state) => ({
      score: Math.max(0, state.score - 50),
      combo: 0,
    })),

  setInitialState: (score, combo, step) =>
    set({
      score: score || 0,
      combo: combo || 0,
      currentStep: step || 1,
    }),

  resetGame: () => set({ score: 0, combo: 0, currentStep: 1 }),
}));
