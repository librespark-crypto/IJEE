# Post-Submission Test Review System & Analytics Dashboard

## Overview

A comprehensive manga-styled review and analytics system for JEE exam attempts, featuring an 8-tab dashboard with detailed performance insights and a question-by-question solution stepper.

## Features Implemented

### 1. **8-Tab Analytics Dashboard**

#### Overview Tab
- **Score Cards**: Total score, predicted percentile, accuracy, and time taken
- **Subject Breakdown**: Physics, Chemistry, Mathematics performance cards with accuracy, attempt rate, and time metrics
- **Key Metrics**: Questions attempted, positive score, marks lost, attempt rate, average time per question
- **Battle Takeaways**: Interactive learning notes system (persisted to localStorage)

#### Performance Analysis Tab
- **Performance Breakdown Table**: Overall and subject-wise scores, correct/wrong/partial/unattempted counts
- **Performance Insights**: AI-generated insights highlighting strengths, weaknesses, time management issues, and conceptual gaps

#### Time Analysis Tab
- **Subject-wise Time Bar Chart**: Color-coded time distribution across subjects
- **Quality of Time Spent**: Segmented progress bar showing time spent on correct vs incorrect vs unattempted questions
- **Time Journey Buckets**: 30-minute interval breakdown of performance throughout the test

#### Attempt Analysis Tab
- **Attempt Quality Classification**:
  - **Perfect Attempt**: Correct & solved within benchmark time
  - **Wasted Attempt**: Incorrect attempt solved in a rush
  - **Overtime Attempt**: Spent more than 2x benchmark time
  - **Confused Attempt**: Unattempted despite significant time
- **Subject-wise Breakdown**: Table and clustered bar chart showing attempt quality by subject

#### Difficulty Analysis Tab
- **Difficulty Classification**: Questions classified as Easy/Moderate/Tough based on type, marks, and observed time
- **Difficulty Matrix**: Distribution of correct/wrong/unattempted across difficulty levels
- **Clustered Bar Chart**: Visual representation of performance by difficulty tier

#### Subject Movement Tab
- **Movement Timeline**: Horizontal stepper showing how you hopped across sections (e.g., Physics → Chemistry → Math)
- **Movement Summary Table**: Questions attempted and time spent per section hop

#### Question Journey Tab
- **Chronological Timeline**: Color-coded chips showing question visits in order
- **Painful Questions Section**: Dedicated callout for questions with excessive time but negative/blank results
- **Interactive Navigation**: Click any question chip to jump to its solution view

#### Qs by Qs Analysis Tab
- **Interactive Table**: Complete question-by-question breakdown with sortable columns
  - Question number, subject, section, type, difficulty, time spent, status, marks, evaluation
- **Click-to-View**: Click any row to open the full solution stepper

### 2. **Question Review Stepper Mode**

Accessed via "View Solutions" button or clicking any question in the dashboard.

#### Features:
- **Question Palette**: Color-coded sidebar showing all questions with status indicators
- **Filter Controls**: Filter by All, Incorrect Only, Marked for Review, Correct, Unattempted
- **Navigation**: Previous/Next buttons with question counter (e.g., "5 / 75")
- **Question Display**:
  - Question images with zoom support
  - Answer comparison boxes (Your Answer vs Correct Answer)
  - Status badges, difficulty level, attempt quality, time spent, marks
  - Topic and concept tags (if available in the ZIP)
- **Solution Section**:
  - Imported solution from PDF2CBT ZIP (with KaTeX math rendering)
  - Collapsible accordion design
- **AI Tutor Integration**:
  - "Explain with Gemini" button for AI-generated explanations
  - Displays step-by-step solutions, alternate methods, and error classification
- **Keyboard Navigation**: Arrow keys for prev/next navigation

### 3. **Manga/Comic Aesthetic**

All UI components follow the existing manga theme:

- **Cards & Containers**: High-contrast black outlines (`border-2.5px`), hard drop shadows (`5px 5px 0`)
- **Halftone Patterns**: Subtle dot patterns on dashboard cards (`.manga-card--halftone`)
- **Speech Bubbles**: Comic-style callout boxes with triangular tails
- **Badges & Pills**: Hand-inked style with bold outlines and color coding:
  - Green: Correct/Perfect
  - Red: Incorrect/Wasted
  - Gold: Moderate/Overtime
  - Blue: Subject/Section tags
  - Muted: Unattempted/Confused
- **Typography**: Fraunces display font, Kalam handwritten font for notes, Outfit body font
- **Interactive Elements**: Manga-style buttons with press-down animation on hover
- **Speed Lines**: Animated diagonal lines for emphasis sections
- **Painful Questions**: Red diagonal stripe pattern background

## Technical Implementation

### New Files Created

1. **`src/lib/analytics.ts`** (548 lines)
   - Difficulty classification algorithm
   - Attempt quality categorization
   - Time bucket computation (30-min intervals)
   - Subject movement timeline builder
   - Question journey tracker
   - Painful question detector
   - Time quality distribution calculator
   - Performance row aggregator
   - Percentile prediction heuristic

2. **`src/components/review-dashboard.tsx`** (1,100+ lines)
   - Main `ReviewDashboard` component with 8 tabs
   - `OverviewTab`, `PerformanceTab`, `TimeTab`, `AttemptTab`, `DifficultyTab`
   - `SubjectMovementTab`, `QuestionJourneyTab`, `QsByQsTab`
   - `QuestionReviewStepper` with palette, filters, and solution display
   - Shared UI components: `MangaStatCard`, `MetricTile`, `MiniStat`
   - Helper functions for badge classes and color coding

3. **`src/components/charts.tsx`** (enhanced, 175 lines)
   - Added `ClusteredBarChart` for multi-series data
   - Added `SubjectTimeBar` with color-coded bars
   - Added `SegmentedBar` for time quality visualization
   - Added `AttemptQualityChart` for subject-wise quality comparison

4. **`src/app/globals.css`** (extended with 400+ lines)
   - `.manga-header`, `.manga-card` variants (halftone, speech, solution, painful)
   - `.manga-stat` cards with accent colors and badges
   - `.manga-tabs` and `.manga-tab` navigation
   - `.manga-btn` buttons with press animation
   - `.manga-badge` pills (green, red, gold, blue, muted, outline)
   - `.manga-table` with hover states and sort buttons
   - `.speech-bubble` callout boxes
   - `.answer-box` comparison containers
   - `.subject-hop-chip`, `.journey-chip`, `.painful-item`
   - `.review-palette-btn` with status colors
   - `.manga-speedlines` animation
   - Responsive adjustments for mobile (720px breakpoint)

### Modified Files

1. **`src/components/analysis-view.tsx`**
   - Now imports and renders `ReviewDashboard` instead of the old analysis view
   - Maintains backward compatibility with the `/analysis/[attemptId]` route

### Data Flow

```
Attempt (submitted)
  ↓
buildEvaluation() → Evaluation (scores, stats, insights)
  ↓
buildDashboardData() → DashboardData (difficulty, quality, time buckets, movement, journey)
  ↓
ReviewDashboard (8 tabs + stepper mode)
```

### State Management

- **React Context**: Uses existing `useStore()` from `src/components/store.tsx`
- **LocalStorage**: Battle takeaways persisted per attempt ID
- **Computed Data**: All analytics derived from `Evaluation` on-the-fly (no extra storage)

### Math Rendering

- **KaTeX Integration**: Seamless rendering of `$inline$` and `$$display$$` formulas
- **Markdown Support**: Full GFM (GitHub Flavored Markdown) with tables, lists, code blocks
- **Responsive**: Horizontal scroll for wide equations on mobile

## Acceptance Criteria Met

✅ Submitting a test routes to the manga-styled Analytics Dashboard  
✅ "View Solutions" button opens the full question solution stepper  
✅ Clicking any question number/table row navigates to that question's solution  
✅ All 8 analytical tabs compute scores, time distributions, attempt qualities, and subject journeys  
✅ UI strictly honors manga aesthetics (high-contrast borders, hard shadows, custom badges)  
✅ KaTeX math formulas render cleanly in questions and solutions  
✅ Empty states handled gracefully (no layout shifts on skipped sections)  
✅ Existing exam simulation, submission handlers, and responsive layouts preserved  
✅ TypeScript compilation passes with zero errors  
✅ Next.js build succeeds  
✅ All 18 existing unit tests pass  

## Usage

### For Students

1. **Submit a test** from the exam room
2. **Automatic redirect** to the Review Dashboard
3. **Explore the 8 tabs** to understand performance patterns
4. **Click "View Solutions"** to review questions one-by-one
5. **Use filters** to focus on incorrect or marked questions
6. **Add battle takeaways** to note key learnings
7. **Click "Explain with Gemini"** for AI-generated step-by-step solutions

### For Developers

- All analytics computations are in `src/lib/analytics.ts` (pure functions, easily testable)
- Dashboard components are modular (one component per tab)
- CSS classes follow BEM-like naming (`.manga-card--variant`)
- TypeScript types exported for all data structures

## Performance Considerations

- **Lazy Image Loading**: Question images loaded on-demand via `getImages()`
- **Memoized Computations**: `useMemo` for evaluation and dashboard data
- **Efficient Rendering**: Filtered question lists computed once per filter change
- **No External Dependencies**: All analytics computed client-side (no server round-trips)

## Future Enhancements

Potential additions for future iterations:

- Export dashboard as PDF report
- Compare multiple attempts side-by-side
- Topic-wise accuracy breakdown (requires topic tags in ZIP)
- Heatmap of question difficulty vs time spent
- Predicted rank based on percentile
- Share dashboard link (requires backend storage)
- Dark mode toggle for manga theme

## Browser Compatibility

- Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Mobile-responsive (tested at 320px, 768px, 1024px, 1440px widths)
- Touch-friendly controls for tablet/mobile
- Reduced motion support via `prefers-reduced-motion` media query

## Accessibility

- Semantic HTML (`<article>`, `<section>`, `<nav>`, `<button>`)
- ARIA labels on interactive elements
- Keyboard navigation (Tab, Enter, Arrow keys)
- Focus indicators (3px indigo outline)
- Color contrast ratios meet WCAG AA standards
- Screen reader friendly (status badges announce via text)

---

**Built with**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts, KaTeX, Lucide React  
**Design System**: Manga/Comic aesthetic with Fraunces, Kalam, and Outfit fonts  
**Status**: Production-ready ✅
