import React from 'react';
import { LuBookOpen, LuPenLine } from 'react-icons/lu';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import CoursePage from './CoursePage';
import PracticePage from './PracticePage';
import { getPronounSidebarLabels } from './config/translations';
import { isDefaultHomeModule } from '../index';

const pronounModule = {
  id: 'pronoun',
  enabled: (config) => config.features.pronounReference || config.features.pronounPractice,
  routes: (config) => {
    const isHome = isDefaultHomeModule('pronoun', config);
    const routes = [];

    if (config.features.pronounPractice) {
      routes.push({
        path: isHome ? '/' : '/pronoun-practice',
        enabled: true,
        element: <ProtectedRoute><PracticePage /></ProtectedRoute>,
      });
    }

    if (config.features.pronounReference) {
      routes.push({
        path: isHome && routes.length === 0 ? '/' : '/pronoun-reference',
        enabled: true,
        element: <ProtectedRoute><CoursePage /></ProtectedRoute>,
      });
    }

    return routes;
  },
  navSections: ({ language, config }) => {
    const t = getPronounSidebarLabels(language);
    const isHome = isDefaultHomeModule('pronoun', config);
    const items = [];

    if (config.features.pronounReference) {
      items.push({
        id: 'pronoun-reference',
        to: isHome && !config.features.pronounPractice ? '/' : '/pronoun-reference',
        icon: <LuBookOpen />,
        color: 'brand',
        name: t.table,
        sub: t.pronounsReference,
      });
    }

    if (config.features.pronounPractice) {
      items.push({
        id: 'pronoun-practice',
        to: isHome ? '/' : '/pronoun-practice',
        icon: <LuPenLine />,
        color: 'brand',
        name: t.practice,
        sub: t.pronounPractice,
      });
    }

    if (items.length === 0) return [];

    return [{
      id: 'pronouns',
      label: t.pronouns,
      items,
    }];
  },
};

export default pronounModule;
