import { buildResults } from '../../components/buildResults';
import { error } from '../../components/icons';

export default ({ build, isOnboarding }) => buildResults(build, isOnboarding, error);
