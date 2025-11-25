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
  template?: {
    header?: string;
    greeting?: string;
    intro?: string;
    overdueHeader?: string;
    overdueSubtext?: string;
    upcomingHeader?: string;
    upcomingSubtext?: string;
    noTasksMessage?: string;
    footer?: string;
  };
}

export const WeeklyDigestEmail = ({
  userName,
  overdueTasks,
  upcomingTasks,
  appUrl,
  template = {},
}: WeeklyDigestEmailProps) => {
  const header = template.header || '🌱 Wekelijkse Tuinagenda';
  const greeting = (template.greeting || 'Hallo {naam},').replace('{naam}', userName);
  const intro = template.intro || 'Hier is je overzicht voor de komende week:';
  const overdueHeader = template.overdueHeader || '⚠️ Achterstallige acties';
  const overdueSubtext = template.overdueSubtext || 'Deze acties hadden al gedaan moeten zijn:';
  const upcomingHeader = template.upcomingHeader || '📅 Aankomende acties';
  const upcomingSubtext = template.upcomingSubtext || 'Deze acties staan gepland voor de komende 7 dagen:';
  const noTasksMessage = template.noTasksMessage || '✨ Je hebt geen openstaande taken! Geniet van je tuin.';
  const footer = template.footer || 'Deze wekelijkse samenvatting is verstuurd omdat je dit hebt ingeschakeld in je instellingen.';

  return (
  <Html>
    <Head />
    <Preview>Je wekelijkse tuinagenda: {overdueTasks.length} achterstallig, {upcomingTasks.length} aankomend</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{header}</Heading>
        <Text style={text}>{greeting}</Text>
        <Text style={text}>{intro}</Text>

        {overdueTasks.length > 0 && (
          <>
            <Heading style={h2}>{overdueHeader} ({overdueTasks.length})</Heading>
            <Text style={subText}>{overdueSubtext}</Text>
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
            <Heading style={h2}>{upcomingHeader} ({upcomingTasks.length})</Heading>
            <Text style={subText}>{upcomingSubtext}</Text>
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
              {noTasksMessage}
            </Text>
          </Section>
        )}

        <Text style={footer}>
          {footer}
        </Text>
      </Container>
    </Body>
  </Html>
)};


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
  maxWidth: '600px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0 20px 0',
  padding: '0 24px',
};

const h2 = {
  color: '#333',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '32px 24px 12px 24px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 24px',
  margin: '0 0 16px 0',
};

const subText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '22px',
  padding: '0 24px',
  margin: '0 0 16px 0',
};

const taskBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  margin: '16px 24px 24px 24px',
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

const footer = {
  color: '#898989',
  fontSize: '12px',
  lineHeight: '22px',
  margin: '32px 24px 0',
};
