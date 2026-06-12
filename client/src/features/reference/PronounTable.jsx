import React from 'react';
import './PronounTable.css';

const pronounData = [
  { person: "1st Sing.", spanish: "Yo", subject: "I", object: "Me", adj: "My", pronoun: "Mine" },
  { person: "2nd Sing.", spanish: "Tú", subject: "You", object: "You", adj: "Your", pronoun: "Yours" },
  { person: "3rd Sing. (M)", spanish: "Él", subject: "He", object: "Him", adj: "His", pronoun: "His" },
  { person: "3rd Sing. (F)", spanish: "Ella", subject: "She", object: "Her", adj: "Her", pronoun: "Hers" },
  { person: "3rd Sing. (N)", spanish: "Eso", subject: "It", object: "It", adj: "Its", pronoun: "(Not used)" },
  { person: "1st Plural", spanish: "Nosotros", subject: "We", object: "Us", adj: "Our", pronoun: "Ours" },
  { person: "2nd Plural", spanish: "Ustedes", subject: "You", object: "You", adj: "Your", pronoun: "Yours" },
  { person: "3rd Plural", spanish: "Ellos", subject: "They", object: "Them", adj: "Their", pronoun: "Theirs" },
];

export default function PronounTable() {
  return (
    <div className="tableContainer">
      <header className="tableHeader">
        <h1 className="mainTitle">THE PRONOUN TABLE</h1>
        <p className="subTitle">Interactive Personal Pronouns Matrix Drill</p>
      </header>

      <div className="glassCard">
        <table className="pronounTable">
          <thead>
            <tr>
              <th>Person</th>
              <th>Subject</th>
              <th>Object</th>
              <th>Possessive Adjective</th>
              <th>Possessive Pronoun</th>
            </tr>
          </thead>
          <tbody>
            {pronounData.map((row, idx) => (
              <tr key={idx}>
                <td className="personCell">
                  <span className="engDesc">{row.person}</span>
                  <span className="spaDesc">{row.spanish}</span>
                </td>
                <td className="highlightCell">
                  {row.subject === "I" || row.subject === "He" || row.subject === "She" || row.subject === "We" || row.subject === "They" ? (
                    row.subject
                  ) : (
                    <input type="text" className="cellInput" placeholder="Type..." />
                  )}
                </td>
                <td>
                  {row.object === "Me" || row.object === "Us" ? (
                    row.object
                  ) : (
                    <input type="text" className="cellInput" placeholder="Type..." />
                  )}
                </td>
                <td>
                  {row.adj === "Your" || row.adj === "His" || row.adj === "Her" || row.adj === "Its" ? (
                    row.adj
                  ) : (
                    <input type="text" className="cellInput" placeholder="Type..." />
                  )}
                </td>
                <td>
                  {row.pronoun === "Mine" || row.pronoun === "Yours" || row.pronoun === "His" || row.pronoun === "Hers" || row.pronoun === "Theirs" ? (
                    row.pronoun
                  ) : (
                    <input type="text" className="cellInput" placeholder="Type..." />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="tableFooter">
        <p>© 2026 Pronoun Codex Matrix • Active Drill • Hover Effect Enabled</p>
      </footer>
    </div>
  );
}
