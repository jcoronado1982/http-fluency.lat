import React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

/**
 * CourseSessionCard — tarjeta grande de "continuar sesión" con carrusel de
 * categorías, progreso y CTA. Presentacional: todo el estado y los datos
 * llegan por props desde DashboardHero.
 */
export default function CourseSessionCard({
    activeCourse,
    carouselItems,
    activeSlide,
    canCycleCourses,
    onCycle,
    categoryLabel,
    courseImage,
    cardsRemaining,
    minutesLeft,
    progressPercent,
    labels,
    language,
    onOpen,
}) {
    const previousCourseLabel = language === 'es' ? 'Categoría anterior' : 'Previous category';
    const nextCourseLabel = language === 'es' ? 'Siguiente categoría' : 'Next category';
    const isDailyReview = Boolean(activeCourse?.isDailyReview);

    return (
        <article className="dash-course-card" style={{ '--dash-course-image': `url("${courseImage}")` }}>
            <div className="dash-course-topbar">
                <span className="dash-course-badge">
                    {isDailyReview
                        ? labels.dailyReviewBadge
                        : (activeCourse?.isCurrentGoal ? labels.currentGoal : categoryLabel)}
                </span>
            </div>
            {canCycleCourses && (
                <>
                    <button
                        type="button"
                        className="dash-course-carousel-btn dash-course-carousel-btn--prev"
                        onClick={() => onCycle(-1)}
                        aria-label={previousCourseLabel}
                    >
                        <FiChevronLeft aria-hidden />
                    </button>
                    <button
                        type="button"
                        className="dash-course-carousel-btn dash-course-carousel-btn--next"
                        onClick={() => onCycle(1)}
                        aria-label={nextCourseLabel}
                    >
                        <FiChevronRight aria-hidden />
                    </button>
                    <div className="dash-course-carousel-dots" aria-hidden>
                        {carouselItems.map((item, index) => (
                            <span
                                key={item.key}
                                className={`dash-course-carousel-dot ${index === activeSlide ? 'is-active' : ''}`}
                            />
                        ))}
                    </div>
                </>
            )}
            <h2>{isDailyReview ? labels.dailyReviewTitle : labels.courseTitle.replace('{category}', categoryLabel)}</h2>
            <p>
                {isDailyReview
                    ? labels.dailyReviewMeta
                    : activeCourse?.resumeSession
                    ? labels.courseMeta
                        .replace('{category}', categoryLabel)
                        .replace('{deck}', activeCourse.deckLabel || activeCourse.deckName || labels.defaultDeck)
                    : labels.missionFallback}
            </p>
            {cardsRemaining > 0 && (
                <span className="dash-course-progress-copy">
                    {isDailyReview
                        ? labels.dailyReviewCards.replace('{n}', String(cardsRemaining))
                        : (
                            <>
                                {labels.cardsRemaining.replace('{n}', String(cardsRemaining))}
                                {' · '}
                                {labels.minutesLeft.replace('{n}', String(minutesLeft))}
                            </>
                        )}
                </span>
            )}
            <div className="dash-course-progress" aria-hidden="true">
                <span style={{ width: `${progressPercent}%` }} />
            </div>
            <button
                type="button"
                className="dash-course-cta"
                onClick={onOpen}
            >
                {isDailyReview ? labels.dailyReviewButton : labels.continueButton}
            </button>
        </article>
    );
}
