import { useParams } from 'react-router';
import { ExistingProblem, NewProblem } from './components/ProblemEditor';

/** /admin/problems/new and /admin/problems/:id (spec 13.2). */
export function Component() {
  const { id } = useParams();
  // Keyed by id: the editor state (forms, drafts, verdicts) belongs to one problem.
  return id ? <ExistingProblem key={id} id={id} /> : <NewProblem />;
}

export default Component;
