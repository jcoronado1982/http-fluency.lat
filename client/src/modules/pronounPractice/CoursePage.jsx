import React from 'react';
import './CoursePage.css';
import { PRONOUN_REFERENCE_DATA } from './domain/pronounReferenceData';

export default function CoursePage() {
  return (
    <div className="courseContainer">
      <main className="courseMain">

        <header className="courseHeader">
          <h1 className="courseTitle" style={{ letterSpacing: '-1.5px' }}>Pronouns in English</h1>
        </header>

        <div className="courseCard">
          <div className="courseContent">
            <div className="tableWrapper">
              <table className="codexTable">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Subject</th>
                    <th>Object</th>
                    <th>Poss. Adjective</th>
                    <th>Poss. Pronoun</th>
                  </tr>
                </thead>
                <tbody>
                  {PRONOUN_REFERENCE_DATA.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="personCell">
                          <span className="personName">{row.person}</span>
                          <span className="personTranslation">{row.translation}</span>
                        </div>
                      </td>

                      {['subject', 'object', 'possAdj', 'possPro'].map(colKey => {
                        const val = row[colKey];

                        if (val === null) {
                          return (
                            <td key={colKey}>
                              <span className="nullValue">n/a</span>
                            </td>
                          );
                        }

                        return (
                          <td key={colKey}>
                            <span className="pronounValue">{val}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
