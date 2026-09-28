# Project Plan: mTask

## Current Status
The application has successfully moved to a two-column layout. Key features implemented include:
- **Recurring Tasks**: Support for daily, weekly, and monthly repetitions with interval configuration.
- **Priority Heatmap**: Visual distribution of task priorities using a color-coded chart.
- **Split Interface**: Configuration and creation moved to the left; active task management on the right.
- **Machine Learning Integration**: On-device task classification using ONNX runtime.

## Active Tasks
- [ ] **Clean up Component Errors**: Fix the duplicate identifier error in `src/components/TaskItem.tsx`.
- [ ] **Refine Layout**: Ensure the two-column layout stacks correctly on mobile devices.
- [ ] **Add Quick Actions**: Implement a "Quick Add" bar to allow rapid task entry.

## Future Roadmap
- [ ] **NLP Command Bar**: Implement a single input field that parses date, time, and task name automatically.
- [ ] **Sentiment Analysis**: Enhance the ML model to detect emotional urgency or stress in notes.
- [ ] **PWA Support**: Add service workers for full offline functionality and "Add to Home Screen" capability.
- [ ] **Kanban View**: Develop a drag-and-drop board interface for different task stages.
- [ ] **Enhanced Backup**: Add support for exporting data as a formatted Markdown file.
