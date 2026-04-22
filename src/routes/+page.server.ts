import { loadData } from '$lib/server/load-projection.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const data = loadData();
	return { data };
};
