import React from 'react';
import './CoursePage.css';
import { FiCpu } from 'react-icons/fi';

const PRONOUNS_DATA = [
  { "id": "1", "person": "1st Sing.", "subject": "I", "object": "Me", "possAdj": "My", "possPro": "Mine", "translation": "Yo" },
  { "id": "2", "person": "2nd Sing.", "subject": "You", "object": "You", "possAdj": "Your", "possPro": "Yours", "translation": "Tú" },
  { "id": "3", "person": "3rd Sing. (M)", "subject": "He", "object": "Him", "possAdj": "His", "possPro": "His", "translation": "Él" },
  { "id": "4", "person": "3rd Sing. (F)", "subject": "She", "object": "Her", "possAdj": "Her", "possPro": "Hers", "translation": "Ella" },
  { "id": "5", "person": "3rd Sing. (N)", "subject": "It", "object": "It", "possAdj": "Its", "possPro": null, "translation": "Eso" },
  { "id": "6", "person": "1st Plural", "subject": "We", "object": "Us", "possAdj": "Our", "possPro": "Ours", "translation": "Nosotros" },
  { "id": "7", "person": "2nd Plural", "subject": "You", "object": "You", "possAdj": "Your", "possPro": "Yours", "translation": "Ustedes" },
  { "id": "8", "person": "3rd Plural", "subject": "They", "object": "Them", "possAdj": "Their", "possPro": "Theirs", "translation": "Ellos" }
];

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
                  {PRONOUNS_DATA.map((row) => (
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