const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const DEFAULT_GAP = 16;
const ARROW_CLAMP = 24;

/**
 * Posiciona el tooltip anclado al centro del anchor con flecha triangular clara.
 */
export function computeTooltipLayout({
    anchorRect,
    viewport,
    tooltipWidth,
    tooltipHeight,
    gap = DEFAULT_GAP,
    preferredPlacements,
}) {
    if (!anchorRect) return null;

    const margin = 12;
    const anchorCx = anchorRect.left + anchorRect.width / 2;
    const anchorCy = anchorRect.top + anchorRect.height / 2;
    const isHeaderZone = anchorRect.top < 120;
    const isFooterZone = anchorRect.bottom > viewport.height - 120;
    const isNarrowAnchor = anchorRect.width < 300;

    let order;
    if (preferredPlacements?.length) {
        order = [...preferredPlacements, 'right', 'bottom', 'left', 'top'].filter(
            (placement, index, placements) => placements.indexOf(placement) === index,
        );
    } else if (isNarrowAnchor) {
        order = ['right', 'bottom', 'left', 'top'];
    } else if (isHeaderZone) {
        order = ['bottom', 'right', 'left', 'top'];
    } else if (isFooterZone) {
        order = ['top', 'bottom', 'right', 'left'];
    } else {
        order = ['bottom', 'top', 'right', 'left'];
    }

    for (const placement of order) {
        const layout = layoutForPlacement(placement, {
            anchorRect,
            viewport,
            tooltipWidth,
            tooltipHeight,
            margin,
            anchorCx,
            anchorCy,
            gap,
        });
        if (layout && fits(layout, viewport, tooltipWidth, tooltipHeight, margin)) {
            return layout;
        }
    }

    const fallback = layoutForPlacement('bottom', {
        anchorRect,
        viewport,
        tooltipWidth,
        tooltipHeight,
        margin,
        anchorCx,
        anchorCy,
        gap,
    });
    return fallback;
}

function fits({ top, left }, viewport, tooltipWidth, tooltipHeight, margin) {
    return top >= margin
        && left >= margin
        && top + tooltipHeight <= viewport.height - margin
        && left + tooltipWidth <= viewport.width - margin;
}

function layoutForPlacement(
    placement,
    { anchorRect, viewport, tooltipWidth, tooltipHeight, margin, anchorCx, anchorCy, gap },
) {
    let top;
    let left;
    let arrowOffset;

    if (placement === 'bottom') {
        top = anchorRect.bottom + gap;
        left = clamp(anchorCx - tooltipWidth / 2, margin, viewport.width - tooltipWidth - margin);
        arrowOffset = anchorCx - left;
    } else if (placement === 'top') {
        top = anchorRect.top - tooltipHeight - gap;
        left = clamp(anchorCx - tooltipWidth / 2, margin, viewport.width - tooltipWidth - margin);
        arrowOffset = anchorCx - left;
    } else if (placement === 'right') {
        top = clamp(anchorCy - tooltipHeight / 2, margin, viewport.height - tooltipHeight - margin);
        left = anchorRect.right + gap;
        arrowOffset = anchorCy - top;
    } else if (placement === 'left') {
        top = clamp(anchorCy - tooltipHeight / 2, margin, viewport.height - tooltipHeight - margin);
        left = anchorRect.left - tooltipWidth - gap;
        arrowOffset = anchorCy - top;
    } else {
        return null;
    }

    const maxArrow = (placement === 'right' || placement === 'left')
        ? tooltipHeight - ARROW_CLAMP
        : tooltipWidth - ARROW_CLAMP;

    return {
        top: clamp(top, margin, Math.max(margin, viewport.height - tooltipHeight - margin)),
        left: clamp(left, margin, Math.max(margin, viewport.width - tooltipWidth - margin)),
        placement,
        arrowOffset: clamp(arrowOffset, ARROW_CLAMP, maxArrow),
    };
}
