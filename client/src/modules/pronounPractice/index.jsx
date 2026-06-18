import React from 'react';
import { FiBook, FiEdit3 } from 'react-icons/fi';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import CoursePage from '../../pages/CoursePage';
import PracticePage from './PracticePage';
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
  navSections: ({ t, config }) => {
    const isHome = isDefaultHomeModule('pronoun', config);
    const items = [];

    if (config.features.pronounReference) {
      items.push({
        id: 'pronoun-reference',
        to: isHome && !config.features.pronounPractice ? '/' : '/pronoun-reference',
        icon: <FiBook />,
        color: 'purple',
        name: t.table,
        sub: t.pronounsReference,
      });
    }

    if (config.features.pronounPractice) {
      items.push({
        id: 'pronoun-practice',
        to: isHome ? '/' : '/pronoun-practice',
        icon: <FiEdit3 />,
        color: 'purple',
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
