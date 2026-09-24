/** One answered question, shown under a task next to the headline priority. */
export interface AnswerSummary {
  question: string;
  answer: string;
}

export interface RecurrenceRule {
  type: 'daily' | 'weekly' | 'monthly' | 'none';
  interval?: number;
}

export interface TaskPriority {
  /** Headline result, from the first 'score' question; empty when the questions have none. */
  label: string;
  score: number;
  confidence: number;
  status: 'pending' | 'done' | 'error';
  /** Answers to the remaining questions. */
  answers?: AnswerSummary[];
  /** Picked by the user; classification results no longer replace it. */
  manual?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  done: boolean;
  priority?: TaskPriority;
  recurrence?: RecurrenceRule;
}
