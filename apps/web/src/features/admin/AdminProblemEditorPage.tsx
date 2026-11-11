import { useParams } from 'react-router';
import { ExistingProblem, NewProblem } from './components/ProblemEditor';

/** /admin/problems/new and /admin/problems/:id (spec 13.2). */
export function Component() {
  const { id } = useParams();
  return id ? <ExistingProblem id={id} /> : <NewProblem />;
}

export default Component;
