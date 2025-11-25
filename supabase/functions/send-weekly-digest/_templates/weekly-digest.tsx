import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22';
import * as React from 'npm:react@18.3.1';

interface WeeklyTask {
  type: string;
  typeLabel: string;
  seedName: string;
  bedName: string;
  dueDate: string;
  isOverdue: boolean;
}

interface WeeklyDigestEmailProps {
  userName: string;
  overdueTasks: WeeklyTask[];
  upcomingTasks: WeeklyTask[];
  appUrl: string;
}

export const WeeklyDigestEmail = ({
  userName,
  overdueTasks,
  upcomingTasks,
  appUrl,
}: WeeklyDigestEmailProps) => (
  <Html>
    <Head />
    <Preview>Je wekelijkse tuinagenda: {overdueTasks.length} achterstallig, {upcomingTasks.length} aankomend</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🌱 Wekelijkse Tuinagenda</Heading>
        <Text style={text}>Hallo {userName},</Text>
        <Text style={text}>
          Hier is je overzicht voor de komende week:
        </Text>

        {overdueTasks.length > 0 && (
          <>
            <Heading style={h2}>⚠️ Achterstallige acties ({overdueTasks.length})</Heading>
            <Text style={subText}>Deze acties hadden al gedaan moeten zijn:</Text>
            <Section style={taskBox}>
              {overdueTasks.map((task, idx) => (
                <div key={idx} style={taskItem}>
                  <Text style={taskTitle}>{task.typeLabel}</Text>
                  <Text style={taskDetail}>
                    <strong>Gewas:</strong> {task.seedName}
                  </Text>
                  <Text style={taskDetail}>
                    <strong>Bak:</strong> {task.bedName}
                  </Text>
                  <Text style={{ ...taskDetail, color: '#dc2626' }}>
                    <strong>Gepland:</strong> {task.dueDate}
                  </Text>
                  {idx < overdueTasks.length - 1 && <hr style={divider} />}
                </div>
              ))}
            </Section>
          </>
        )}

        {upcomingTasks.length > 0 && (
          <>
            <Heading style={h2}>📅 Aankomende acties ({upcomingTasks.length})</Heading>
            <Text style={subText}>Deze acties staan gepland voor de komende 7 dagen:</Text>
            <Section style={taskBox}>
              {upcomingTasks.map((task, idx) => (
                <div key={idx} style={taskItem}>
                  <Text style={taskTitle}>{task.typeLabel}</Text>
                  <Text style={taskDetail}>
                    <strong>Gewas:</strong> {task.seedName}
                  </Text>
                  <Text style={taskDetail}>
                    <strong>Bak:</strong> {task.bedName}
                  </Text>
                  <Text style={taskDetail}>
                    <strong>Gepland:</strong> {task.dueDate}
                  </Text>
                  {idx < upcomingTasks.length - 1 && <hr style={divider} />}
                </div>
              ))}
            </Section>
          </>
        )}

        {overdueTasks.length === 0 && upcomingTasks.length === 0 && (
          <Section style={taskBox}>
            <Text style={{ ...text, textAlign: 'center' as const, color: '#16a34a' }}>
              ✨ Je hebt geen openstaande taken! Geniet van je tuin.
            </Text>
          </Section>
        )}

        <Link
          href={appUrl}
          target="_blank"
          style={button}
        >
          Open Dashboard
        </Link>
        <Text style={footer}>
          Deze wekelijkse samenvatting is verstuurd omdat je dit hebt ingeschakeld in je instellingen.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default WeeklyDigestEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0 20px 0',
  padding: '0 48px',
};

const h2 = {
  color: '#333',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '32px 48px 12px 48px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 48px',
  margin: '0 0 16px 0',
};

const subText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '22px',
  padding: '0 48px',
  margin: '0 0 16px 0',
};

const taskBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  margin: '16px 48px 24px 48px',
  padding: '16px',
};

const taskItem = {
  margin: '12px 0',
};

const taskTitle = {
  color: '#16a34a',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 8px 0',
};

const taskDetail = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '4px 0',
};

const divider = {
  border: 'none',
  borderTop: '1px solid #e5e7eb',
  margin: '16px 0',
};

const button = {
  backgroundColor: '#16a34a',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '200px',
  padding: '12px 0',
  margin: '24px 48px',
};

const footer = {
  color: '#898989',
  fontSize: '12px',
  lineHeight: '22px',
  margin: '32px 48px 0',
};
