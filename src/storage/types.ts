/** 'levels': pick one of the criteria levels. 'yesno': answer the instructions alone, yes or no. */
export type PriorityMode = 'levels' | 'yesno';

export interface PriorityQuestion {
  instructions: string;
  mode: PriorityMode;
}

export interface TaskPriority {
  label: string;
  score: number;
  confidence: number;
  status: 'pending' | 'done' | 'error';
  /** How the result was computed; absent on results stored before yes/no mode existed. */
  mode?: PriorityMode;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  done: boolean;
  priority?: TaskPriority;
}
