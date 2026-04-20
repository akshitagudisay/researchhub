import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def send_email(to_email: str, subject: str, body: str) -> None:
    """Send an email via Gmail SMTP_SSL.

    Reads EMAIL_USER and EMAIL_PASS from environment variables.
    Raises RuntimeError if credentials are missing.
    Propagates smtplib exceptions on delivery failure.
    """
    email_user = os.environ.get("EMAIL_USER")
    email_pass = os.environ.get("EMAIL_PASS")

    if not email_user or not email_pass:
        raise RuntimeError(
            "EMAIL_USER and EMAIL_PASS environment variables must be set"
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = email_user
    msg["To"] = to_email

    msg.attach(MIMEText(body, "plain"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
        server.login(email_user, email_pass)
        server.sendmail(email_user, to_email, msg.as_string())
