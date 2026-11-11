import { useParams } from 'react-router';
import { ExistingContest, NewContest } from './components/ContestEditor';

/** /admin/contests/new and /admin/contests/:id (spec 13.2). */
export function Component() {
  const { id } = useParams();
  return id ? <ExistingContest id={id} /> : <NewContest />;
}

export default Component;
