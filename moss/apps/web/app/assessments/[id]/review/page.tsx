import { redirect } from 'next/navigation';

/** The red review dashboard was the old screen. Review opens the current assessment. */
export default function AssessmentReviewPage({ params }: { params: { id: string } }) {
  redirect(`/assessments/${params.id}`);
}
