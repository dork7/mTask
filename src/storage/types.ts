export interface TaskPriority {
  label: string;
  score: number;
  confidence: number;
  status: 'pending' | 'done' | 'error';
}

export interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  done: boolean;
  priority?: TaskPriority;
}
