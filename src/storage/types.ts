/** One answered question, shown under a task next to the headline priority. */
export interface AnswerSummary {
  question: string;
  answer: string;
}

export interface TaskPriority {
  /** Headline result, from the first 'score' question; empty when the questions have none. */
  label: string;
  score: number;
  confidence: number;
  status: 'pending' | 'done' | 'error';
  /** Answers to the remaining questions. */
  answers?: AnswerSummary[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  done: boolean;
  priority?: TaskPriority;
}
